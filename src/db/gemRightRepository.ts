import { rewardPolicy } from '../rewards/rewardPolicy';
import { getCompletedDates } from './stickerRepository';
import { hasTasksOn } from './taskDayQuery';
import type { TimetableDatabase } from './types';
import { withRewardTransaction } from './rewardQueue';

/**
 * 연속 달성으로 얻는 "실물 보석을 받을 자격".
 * 앱의 보석 개수(장부)는 건드리지 않는다: 실물 보석과 꼬이지 않도록 개수는 딸이 직접 적고, 이 모듈은 자격의 요청·지급 상태만 기록한다.
 */
type Db = Pick<TimetableDatabase, 'getFirstAsync' | 'getAllAsync' | 'runAsync'>;

const familyId = 'local-family';
const childId = 'local-child';
/** 연속을 거슬러 세는 최대 일수(안전장치). 보통은 끊긴 날이나 할 일이 없는 날이 이어지는 곳에서 먼저 멈춘다. */
const LOOKBACK_DAYS = 3650;
/** 할 일이 없는 날이 이만큼 이어지면 더 거슬러 올라가지 않는다 */
const MAX_EMPTY_RUN = 60;

export type GemRightSummary = {
  /** 아직 요청하지 않은 자격 */
  readonly available: number;
  /** 아빠에게 요청했고 아직 받지 못한 자격 */
  readonly requested: number;
  /** 지금까지 받은 자격 수 */
  readonly given: number;
  /** 지금 이어지고 있는 연속 달성 일수 */
  readonly streak: number;
  /** 다음 자격까지 남은 연속 일수 (1~giftStreakDays) */
  readonly daysToNext: number;
};

function parse(date: string): Date { const [year, month, day] = date.split('-').map(Number); return new Date(year, month - 1, day); }
function format(value: Date): string { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
function shift(date: string, days: number): string { const value = parse(date); value.setDate(value.getDate() + days); return format(value); }

/**
 * date까지 이어진 연속 달성 일수. date가 할 일이 있는 날인데 다 끝내지 못했다면 0이다.
 * 할 일이 없는 날은 건너뛰고(연속을 끊지도 늘리지도 않는다), 할 일이 있는데 다 끝내지 못한 날을 만나면 거기서 끝난다.
 */
export async function streakEndingAt(database: Db, date: string, completed?: ReadonlySet<string>): Promise<number> {
  const doneDates = completed ?? new Set(await getCompletedDates(database));
  let count = 0;
  let emptyRun = 0;
  for (let index = 0, day = date; index < LOOKBACK_DAYS; index += 1, day = shift(day, -1)) {
    if (!await hasTasksOn(database, day, parse(day).getDay())) {
      emptyRun += 1;
      if (emptyRun >= MAX_EMPTY_RUN) break;
      continue;
    }
    emptyRun = 0;
    if (!doneDates.has(day)) break;
    count += 1;
  }
  return count;
}

/** 지금 이어지고 있는 연속. 오늘 할 일을 아직 다 못 끝냈으면 어제까지의 연속을 보여준다("아직 남았어요"). */
export async function currentStreak(database: Db, today: string): Promise<number> {
  const completed = new Set(await getCompletedDates(database));
  const todayHasTasks = await hasTasksOn(database, today, parse(today).getDay());
  const start = todayHasTasks && !completed.has(today) ? shift(today, -1) : today;
  return streakEndingAt(database, start, completed);
}

/**
 * 그날의 완료 상태가 바뀐 뒤 자격을 맞춘다. 과거 날짜를 고치면 그 뒤 날짜들의 연속도 달라지므로,
 * 바뀐 날짜부터 마지막으로 완료한 날짜까지 차례로 다시 계산한다: 아직 요청하지 않은 자격을 모두 지운 뒤,
 * 할 일이 있는 날을 끝냈고 그날 연속이 giftStreakDays의 배수가 되는 날마다 자격 1개를 만든다(날짜당 1개).
 * 할 일이 없는 날에는 자격이 생기지 않는다. 이미 요청·지급된 자격은 건드리지 않는다.
 */
export async function syncGemRightForDate(database: Db, date: string): Promise<void> {
  const completed = new Set(await getCompletedDates(database));
  const latest = [...completed].sort().at(-1);
  const end = latest !== undefined && latest > date ? latest : date;
  let streak = await streakEndingAt(database, shift(date, -1), completed); // 바뀐 날 바로 전까지 이어진 연속
  await database.runAsync("DELETE FROM gem_rights WHERE family_id = ? AND earned_date >= ? AND state = 'available'", familyId, date);
  for (let day = date; day <= end; day = shift(day, 1)) {
    if (!await hasTasksOn(database, day, parse(day).getDay())) continue; // 할 일 없는 날은 연속을 끊지도 늘리지도 않는다
    if (!completed.has(day)) { streak = 0; continue; }
    streak += 1;
    if (streak % rewardPolicy.giftStreakDays === 0) await database.runAsync('INSERT OR IGNORE INTO gem_rights (family_id, child_id, earned_date) VALUES (?, ?, ?)', familyId, childId, day);
  }
}

export async function getGemRightSummary(database: Db, today: string): Promise<GemRightSummary> {
  const rows = await database.getAllAsync<{ state: string; count: number }>('SELECT state, COUNT(*) AS count FROM gem_rights WHERE family_id = ? GROUP BY state', familyId);
  const count = (state: string) => rows.find((row) => row.state === state)?.count ?? 0;
  const streak = await currentStreak(database, today);
  return { available: count('available'), requested: count('requested'), given: count('given'), streak, daysToNext: rewardPolicy.giftStreakDays - (streak % rewardPolicy.giftStreakDays) };
}

/** 받을 수 있는 자격 전체를 아빠에게 요청한다. 요청된 개수를 돌려준다(없으면 0). */
export async function requestAvailableRights(database: Db & Pick<TimetableDatabase, 'execAsync'>): Promise<number> {
  // 체크 기록·동기화 교체와 같은 줄에서 한 트랜잭션으로 바꾼다(동기화가 이 변경을 덮지 않게)
  return withRewardTransaction(database, async () => {
    const result = await database.runAsync("UPDATE gem_rights SET state = 'requested', requested_at = CURRENT_TIMESTAMP WHERE family_id = ? AND state = 'available'", familyId) as { readonly changes?: number };
    return result.changes ?? 0;
  });
}

/** 아빠가 실물 보석을 준 만큼(오래된 요청부터) 지급 처리한다. 장부(보석 개수)는 바꾸지 않는다. */
export async function markRequestedGiven(database: Db & Pick<TimetableDatabase, 'execAsync'>, count: number): Promise<number> {
  if (!Number.isInteger(count) || count < 1) throw new Error('지급한 개수는 1 이상의 숫자로 적어 주세요.');
  return withRewardTransaction(database, async () => {
    const requested = (await database.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM gem_rights WHERE family_id = ? AND state = 'requested'", familyId))?.count ?? 0;
    if (count > requested) throw new Error(`요청된 보석은 ${requested}개예요.`);
    // 한 문장으로 처리해 중간에 실패해도 일부만 지급 처리되지 않게 한다
    await database.runAsync("UPDATE gem_rights SET state = 'given', given_at = CURRENT_TIMESTAMP WHERE id IN (SELECT id FROM gem_rights WHERE family_id = ? AND state = 'requested' ORDER BY earned_date, id LIMIT ?)", familyId, count);
    return count;
  });
}
