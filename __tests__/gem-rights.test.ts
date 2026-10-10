/** @jest-environment node */
import { currentStreak, getGemRightSummary, markRequestedGiven, requestAvailableRights, streakEndingAt, syncGemRightForDate } from '../src/db/gemRightRepository';
import { migrateDatabase } from '../src/db/migrations';
import { setTaskCompletionWithRewards } from '../src/db/rewardRepository';
import { getStickerSummary } from '../src/db/stickerRepository';
import { createTask } from '../src/db/taskRepository';
import { openTestDatabase } from '../test-utils/sqliteTestDatabase';

let database: ReturnType<typeof openTestDatabase>;
let taskId: number;

// 평일(월~금)에만 있는 할 일 하나. 2026-09-28은 월요일이다.
const weekdayOf = (date: string) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
const complete = (date: string, done = true) => setTaskCompletionWithRewards(database, taskId, date, weekdayOf(date), done);
const completeAll = async (dates: readonly string[]) => { for (const date of dates) await complete(date); };
const rights = async () => database.getAllAsync<{ earned_date: string; state: string }>('SELECT earned_date, state FROM gem_rights ORDER BY earned_date');

const WEEK_1 = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']; // 월~금
const WEEK_2 = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];

beforeEach(async () => {
  database = openTestDatabase();
  await migrateDatabase(database);
  await createTask(database, { title: '숙제', repeatWeekdays: [1, 2, 3, 4, 5], taskDate: '', effectiveFrom: '2026-09-01' });
  taskId = (await database.getFirstAsync<{ id: number }>('SELECT id FROM tasks WHERE title = ?', '숙제'))!.id;
  await database.runAsync("UPDATE tasks SET created_at = '2026-01-01 00:00:00'"); // 새 규칙: 할 일은 만든 날부터만 센다 → 테스트의 날짜들보다 이전에 만든 것으로 맞춘다
});

describe('연속 5일마다 생기는 실물 보석 자격', () => {
  it('4일 연속까지는 자격이 없고 5일째에 1개가 생긴다', async () => {
    await completeAll(WEEK_1.slice(0, 4));
    expect(await rights()).toEqual([]);
    await complete(WEEK_1[4]);
    expect(await rights()).toEqual([{ earned_date: '2026-10-02', state: 'available' }]);
  });

  it('할 일이 없는 주말은 연속을 끊지도 늘리지도 않는다', async () => {
    // 수·목·금·(주말 건너뜀)·월·화 = 할 일이 있는 5일
    await completeAll(['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05']);
    expect(await rights()).toEqual([]);
    await complete('2026-10-06');
    expect(await rights()).toEqual([{ earned_date: '2026-10-06', state: 'available' }]);
  });

  it('하루를 빼먹으면 연속이 0부터 다시 시작한다', async () => {
    await completeAll(['2026-09-28', '2026-09-29', '2026-09-30']); // 목요일은 안 함
    await completeAll(['2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07']); // 금·월·화·수 = 다시 4일
    expect(await rights()).toEqual([]);
    await complete('2026-10-08');
    expect(await rights()).toEqual([{ earned_date: '2026-10-08', state: 'available' }]);
  });

  it('10일 연속이면 자격이 2개가 된다', async () => {
    await completeAll([...WEEK_1, ...WEEK_2]);
    expect((await rights()).map(({ earned_date }) => earned_date)).toEqual(['2026-10-02', '2026-10-09']);
  });

  it('5일째 체크를 취소하면 요청 전 자격이 사라지고, 다시 체크하면 다시 생긴다', async () => {
    await completeAll(WEEK_1);
    await complete('2026-10-02', false);
    expect(await rights()).toEqual([]);
    await complete('2026-10-02');
    expect(await rights()).toHaveLength(1);
  });

  it('앱의 보석 개수(장부)는 자격이 생겨도 늘지 않는다', async () => {
    await completeAll([...WEEK_1, ...WEEK_2]);
    expect(await getStickerSummary(database)).toMatchObject({ gems: 0, largeGems: 0, total: 0 });
  });
});

describe('요청과 지급', () => {
  it('요청하면 받을 수 있는 자격 전체가 요청 상태가 되고, 요청 뒤 체크를 취소해도 자격은 남는다', async () => {
    await completeAll([...WEEK_1, ...WEEK_2]);
    expect(await getGemRightSummary(database, '2026-10-09')).toMatchObject({ available: 2, requested: 0, given: 0, streak: 10, daysToNext: 5 });
    expect(await requestAvailableRights(database)).toBe(2);
    expect(await requestAvailableRights(database)).toBe(0); // 다시 눌러도 더 요청되지 않는다
    await complete('2026-10-09', false);
    expect(await getGemRightSummary(database, '2026-10-09')).toMatchObject({ available: 0, requested: 2, given: 0 });
  });

  it('아빠가 준 만큼만 오래된 요청부터 지급 처리하고, 남은 요청은 그대로 둔다', async () => {
    await completeAll([...WEEK_1, ...WEEK_2]);
    await requestAvailableRights(database);
    await markRequestedGiven(database, 1);
    expect(await rights()).toEqual([{ earned_date: '2026-10-02', state: 'given' }, { earned_date: '2026-10-09', state: 'requested' }]);
    await markRequestedGiven(database, 1);
    expect(await getGemRightSummary(database, '2026-10-09')).toMatchObject({ available: 0, requested: 0, given: 2 });
  });

  it('요청된 것보다 많거나 숫자가 아니면 지급 처리를 거절한다', async () => {
    await completeAll(WEEK_1);
    await requestAvailableRights(database);
    await expect(markRequestedGiven(database, 2)).rejects.toThrow('요청된 보석은 1개');
    await expect(markRequestedGiven(database, 0)).rejects.toThrow();
    await expect(markRequestedGiven(database, 1.5)).rejects.toThrow();
    expect(await rights()).toEqual([{ earned_date: '2026-10-02', state: 'requested' }]);
  });

  it('지급이 끝난 자격은 체크를 취소해도 사라지지 않는다', async () => {
    await completeAll(WEEK_1);
    await requestAvailableRights(database);
    await markRequestedGiven(database, 1);
    await complete('2026-10-02', false);
    expect(await rights()).toEqual([{ earned_date: '2026-10-02', state: 'given' }]);
  });
});

describe('연속 일수 계산', () => {
  it('오늘 할 일을 아직 다 못 끝냈으면 어제까지의 연속을 보여준다', async () => {
    await completeAll(WEEK_1.slice(0, 3));
    expect(await currentStreak(database, '2026-10-01')).toBe(3);
    await complete('2026-10-01');
    expect(await currentStreak(database, '2026-10-01')).toBe(4);
  });

  it('오늘이 할 일 없는 날(주말)이어도 그 전 평일의 연속이 이어진다', async () => {
    await completeAll(WEEK_1);
    expect(await currentStreak(database, '2026-10-03')).toBe(5);
    expect(await currentStreak(database, '2026-10-04')).toBe(5);
  });

  it('streakEndingAt은 그날이 안 끝난 날이면 0이다', async () => {
    await completeAll(WEEK_1.slice(0, 2));
    expect(await streakEndingAt(database, '2026-09-30')).toBe(0);
  });

  it('할 일이 한 번도 없으면 0이고 무한히 거슬러 올라가지 않는다', async () => {
    await database.runAsync('DELETE FROM tasks');
    expect(await currentStreak(database, '2026-10-01')).toBe(0);
  });
});

describe('과거 날짜 수정과 할 일 없는 날', () => {
  it('빠졌던 날을 나중에 체크하면 그 뒤 날짜의 자격이 새로 계산된다', async () => {
    await completeAll(['2026-09-28', '2026-09-29', '2026-10-01', '2026-10-02']); // 수요일(9/30)만 빠짐
    expect(await rights()).toEqual([]);
    await complete('2026-09-30'); // 위젯 등으로 나중에 과거 날짜를 체크
    expect(await rights()).toEqual([{ earned_date: '2026-10-02', state: 'available' }]);
  });

  it('과거 날짜의 체크를 취소하면 그 뒤에 생겼던(요청 전) 자격이 사라진다', async () => {
    await completeAll(WEEK_1);
    expect(await rights()).toHaveLength(1);
    await complete('2026-09-29', false);
    expect(await rights()).toEqual([]);
  });

  it('과거 취소로 연속이 끊겨도 이미 요청한 자격은 유지된다', async () => {
    await completeAll(WEEK_1);
    await requestAvailableRights(database);
    await complete('2026-09-29', false);
    expect(await rights()).toEqual([{ earned_date: '2026-10-02', state: 'requested' }]);
  });

  it('할 일이 없는 주말에 상태를 다시 맞춰도 자격이 하나 더 생기지 않는다', async () => {
    await completeAll(WEEK_1);
    await syncGemRightForDate(database, '2026-10-03'); // 토요일(할 일 없음)
    await syncGemRightForDate(database, '2026-10-04'); // 일요일
    expect(await rights()).toEqual([{ earned_date: '2026-10-02', state: 'available' }]);
  });
});

describe('V12 마이그레이션: 옛 정책의 하루 완료 보석', () => {
  it('보석 합계는 그대로 두고 완료 기록 행은 0으로 바꿔, 체크를 취소해도 개수가 줄지 않는다', async () => {
    // V11 상태의 DB에 옛 정책이 남긴 '하루 완료 보석 1개' 행 두 개와 직접 입력한 개수 조정이 있다고 가정
    await database.execAsync('PRAGMA user_version = 11');
    // V13(학교 칸)도 V11에는 없으니 지워 둔다(다시 마이그레이션할 때 같은 칸을 또 만들지 않게)
    for (const column of ['school_office_code', 'school_code', 'school_name', 'school_grade', 'school_class']) await database.execAsync(`ALTER TABLE timetable_settings DROP COLUMN ${column}`);
    await database.runAsync("INSERT INTO sticker_ledger (family_id, child_id, delta, reason) VALUES ('local-family','local-child',1,'daily-completion:2026-09-28')");
    await database.runAsync("INSERT INTO sticker_ledger (family_id, child_id, delta, reason) VALUES ('local-family','local-child',1,'daily-completion:2026-09-29')");
    await database.runAsync("INSERT INTO sticker_ledger (family_id, child_id, delta, reason) VALUES ('local-family','local-child',3,'manual-count:gem')");
    const before = await getStickerSummary(database);
    expect(before.gems).toBe(5);
    await migrateDatabase(database);
    expect((await getStickerSummary(database)).gems).toBe(5); // 합계 그대로
    const rows = await database.getAllAsync<{ delta: number }>("SELECT delta FROM sticker_ledger WHERE reason LIKE 'daily-completion:%'");
    expect(rows.every(({ delta }) => delta === 0)).toBe(true);
    // 완료 기록 행이 지워져도(체크 취소) 개수는 변하지 않는다
    await database.runAsync("DELETE FROM sticker_ledger WHERE reason = 'daily-completion:2026-09-28'");
    expect((await getStickerSummary(database)).gems).toBe(5);
  });
});

describe('새 할 일은 만든 날부터만 센다', () => {
  it('시작일을 과거로 정해 만들어도 만들기 전 날들은 완료·연속 계산에서 빠진다', async () => {
    await createTask(database, { title: '새 숙제', repeatWeekdays: [1, 2, 3, 4, 5], taskDate: '', effectiveFrom: '2026-09-01' });
    const newId = (await database.getFirstAsync<{ id: number }>('SELECT id FROM tasks WHERE title = ?', '새 숙제'))!.id;
    await database.runAsync("UPDATE tasks SET created_at = '2026-10-01 09:00:00' WHERE id = ?", newId);
    await completeAll(['2026-09-28', '2026-09-29', '2026-09-30']); // 새 숙제가 생기기 전이라 기존 숙제만 하면 그날을 다 한 것
    expect(await streakEndingAt(database, '2026-09-30')).toBe(3);
    await complete('2026-10-01'); // 이제는 새 숙제도 해야 한다
    expect(await streakEndingAt(database, '2026-10-01')).toBe(0);
    await setTaskCompletionWithRewards(database, newId, '2026-10-01', 4, true);
    expect(await streakEndingAt(database, '2026-10-01')).toBe(4);
  });
});
