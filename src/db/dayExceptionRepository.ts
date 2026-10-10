import type { DayException } from '../utils/rollingNotifications';
import type { TimetableDatabase } from './types';

/** 나이스 학사일정에서 자동으로 넣은 휴일의 메모 머리말. 이 표시가 있는 휴일만 자동 갱신이 고치고 지운다(아빠가 직접 넣은 휴일은 그대로). */
export const NEIS_HOLIDAY_PREFIX = '나이스: ';

/** 쉬는 날 종류. holiday: 학교·학원 모두 쉼(그날 일정 통째로 비움), school-off: 학교만 쉼(학교 일정만 뺌). */
export type DayOff = { readonly name: string; readonly kind: 'holiday' | 'school-off' };

/** 저장 type: 쉬는 날은 'holiday'(알림도 모두 건너뜀), 학교만 쉬는 날은 'discretionary'(학교 알림만 건너뜀, 기존 의미) */
const TYPE_OF = { holiday: 'holiday', 'school-off': 'discretionary' } as const;

export async function getDayExceptionsInRange(database: Pick<TimetableDatabase, 'getAllAsync'>, startDate: string, endDate: string, familyId = 'local-family'): Promise<readonly DayException[]> {
  return database.getAllAsync<DayException>(
    `SELECT start_date AS startDate, end_date AS endDate, type
     FROM day_exceptions
     WHERE family_id = ? AND start_date <= ? AND end_date >= ?
     ORDER BY start_date, end_date, id`, familyId, endDate, startDate,
  );
}

/**
 * 그날이 쉬는 날이면 이름과 종류, 아니면 null(P8.8). 쉬는 날(holiday)이 학교만 쉬는 날(discretionary)보다 먼저다.
 * 방학(vacation) 예외는 시간표 세트로 다루므로 여기서는 보지 않는다.
 */
export async function getDayOff(database: Pick<TimetableDatabase, 'getFirstAsync'>, date: string, familyId = 'local-family'): Promise<DayOff | null> {
  const row = await database.getFirstAsync<{ note: string; type: string }>(
    `SELECT note, type FROM day_exceptions WHERE family_id = ? AND type IN ('holiday', 'discretionary') AND start_date <= ? AND end_date >= ?
     ORDER BY CASE type WHEN 'holiday' THEN 0 ELSE 1 END, id LIMIT 1`, familyId, date, date,
  );
  if (!row) return null;
  return { name: row.note.replace(NEIS_HOLIDAY_PREFIX, '').trim() || '쉬는 날', kind: row.type === 'holiday' ? 'holiday' : 'school-off' };
}

/**
 * 기간(from~to, YYYY-MM-DD) 안의 나이스 자동 휴일을 holidays(날짜 → 쉬는 날)와 같게 맞춘다. 바뀐 게 있으면 true(dryRun이면 바꾸지 않고 바꿀 게 있는지만 본다).
 * 아빠가 직접 넣은 휴일(머리말 없음)은 건드리지 않는다. 로그인한 폰에서는 호출하는 쪽이 runAdminEdit로 감싸 서버에 먼저 저장한다.
 */
export async function replaceNeisHolidays(database: Pick<TimetableDatabase, 'getAllAsync' | 'runAsync'>, from: string, to: string, holidays: ReadonlyMap<string, DayOff>, options: { readonly dryRun?: boolean } = {}): Promise<boolean> {
  const existing = await database.getAllAsync<{ id: number; date: string; note: string; type: string }>(
    "SELECT id, start_date AS date, note, type FROM day_exceptions WHERE family_id = 'local-family' AND type IN ('holiday', 'discretionary') AND substr(note, 1, ?) = ? AND start_date >= ? AND start_date <= ?",
    NEIS_HOLIDAY_PREFIX.length, NEIS_HOLIDAY_PREFIX, from, to,
  );
  const same = (row: { date: string; note: string; type: string }) => {
    const wanted = holidays.get(row.date);
    return wanted !== undefined && row.note === `${NEIS_HOLIDAY_PREFIX}${wanted.name}` && row.type === TYPE_OF[wanted.kind];
  };
  let changed = false;
  for (const row of existing) {
    if (same(row)) continue;
    if (options.dryRun) return true;
    await database.runAsync('DELETE FROM day_exceptions WHERE id = ?', row.id);
    changed = true;
  }
  const kept = new Set(existing.filter(same).map((row) => row.date));
  for (const [date, off] of holidays) {
    if (kept.has(date) || date < from || date > to) continue;
    if (options.dryRun) return true;
    await database.runAsync("INSERT INTO day_exceptions (family_id, start_date, end_date, type, note) VALUES ('local-family', ?, ?, ?, ?)", date, date, TYPE_OF[off.kind], `${NEIS_HOLIDAY_PREFIX}${off.name}`);
    changed = true;
  }
  return changed;
}
