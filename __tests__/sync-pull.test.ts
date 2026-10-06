/** @jest-environment node */
import { migrateDatabase } from '../src/db/migrations';
import { createTask, getTodayTasks } from '../src/db/taskRepository';
import { getActiveTimetableSet } from '../src/db/timetableSetRepository';
import { getTimetableItemsForWeekday } from '../src/db/timetableRepository';
import { getGemRightSummary } from '../src/db/gemRightRepository';
import { replaceLocalWithSnapshot } from '../src/sync/pullSnapshot';
import { toLocalSnapshot, toSqliteUtc, toWeekdayCsv, type ServerSnapshot } from '../src/sync/snapshotMapping';
import { formatSyncTime } from '../src/sync/syncStatus';
import { syncSummary } from '../src/components/SyncPanel';
import { syncErrorMessage, syncTarget } from '../src/sync/syncRunner';
import { openTestDatabase } from '../test-utils/sqliteTestDatabase';

jest.mock('../src/server/supabaseClient', () => ({ getSupabase: () => { throw new Error('이 테스트는 서버를 부르지 않는다'); } }));
jest.mock('../src/db/database', () => ({ getDatabase: async () => { throw new Error('이 테스트는 앱 DB를 쓰지 않는다'); } }));
jest.mock('../src/widgets/widgetRefresh', () => ({ applyPendingWidgetChecksNow: jest.fn(), requestWidgetRefresh: jest.fn() }));
jest.mock('../src/notifications/rollingOwners', () => ({ refreshAllRollingOwners: jest.fn() }));

const FAMILY = '11111111-1111-4111-8111-111111111111';
const CHILD = '22222222-2222-4222-8222-222222222222';

// 서버(Supabase)가 돌려주는 모양 그대로의 가족 데이터
const server: ServerSnapshot = {
  tt_periods: [{ id: 501, family_id: FAMILY, period_no: 1, start_time: '09:00', end_time: '09:40', created_at: '2026-09-01T00:00:00+00:00' }],
  tt_timetable_sets: [{ id: 301, family_id: FAMILY, name: '채아', created_at: '2026-09-01T00:00:00+00:00' }, { id: 302, family_id: FAMILY, name: '방학', created_at: '2026-09-01T00:00:00+00:00' }],
  tt_timetable_settings: [{ family_id: FAMILY, active_set_id: 301 }],
  tt_timetable_items: [
    { id: 9001, family_id: FAMILY, set_id: 301, weekday: 2, period_no: 1, start_time: null, end_time: null, title: '국어', category: 'school', color_key: 'korean', icon_key: 'text', alert_mode: 'none', alert_before_min: 0, memo: '', created_at: '2026-09-02T00:00:00+00:00' },
    { id: 9002, family_id: FAMILY, set_id: 301, weekday: 2, period_no: null, start_time: '16:00', end_time: '17:00', title: '피아노', category: 'academy', color_key: 'music', icon_key: 'music-note', alert_mode: 'alarm', alert_before_min: 10, memo: '16:45 차', created_at: '2026-09-02T00:00:00+00:00' },
    { id: 9003, family_id: FAMILY, set_id: 302, weekday: 2, period_no: null, start_time: '10:00', end_time: '11:00', title: '방학 캠프', category: 'care', color_key: 'other', icon_key: 'other', alert_mode: 'none', alert_before_min: 0, memo: '', created_at: '2026-09-02T00:00:00+00:00' }],
  tt_day_exceptions: [{ id: 41, family_id: FAMILY, start_date: '2026-10-09', end_date: '2026-10-09', type: 'holiday', note: '한글날' }],
  tt_tasks: [
    { id: 7001, family_id: FAMILY, title: '줄넘기', repeat_weekdays: [1, 2, 3], task_date: null, remind_time: '19:00', alert_mode: 'notify', sticker_reward: null, effective_from: '2026-09-01', effective_until: null, created_at: '2026-09-01T03:00:00+00:00' },
    { id: 7002, family_id: FAMILY, title: '준비물', repeat_weekdays: null, task_date: '2026-10-06', remind_time: null, alert_mode: 'none', sticker_reward: null, effective_from: null, effective_until: null, created_at: '2026-09-01T03:00:00+00:00' }],
  tt_task_completions: [{ id: 81, family_id: FAMILY, task_id: 7002, completion_date: '2026-10-06', done_at: '2026-10-06T01:15:00+00:00', done_by: 'child' }],
  tt_task_completion_history: [{ family_id: FAMILY, task_id: 7002, completion_date: '2026-10-06' }],
  tt_sticker_ledger: [{ id: 61, family_id: FAMILY, child_id: CHILD, delta: 5, reason: 'manual-count:gem', task_id: null, created_at: '2026-10-01T00:00:00+00:00' }],
  tt_rewards: [{ id: 21, family_id: FAMILY, title: '인형', sticker_goal: 10, achieved_at: null }],
  tt_gem_rights: [{ id: 11, family_id: FAMILY, child_id: CHILD, earned_date: '2026-10-05', state: 'requested', requested_at: '2026-10-05T12:00:00+00:00', given_at: null, created_at: '2026-10-05T11:00:00+00:00' }],
};

let database: ReturnType<typeof openTestDatabase>;
beforeEach(async () => {
  database = openTestDatabase();
  await migrateDatabase(database);
});

test('서버 시각·요일 형식을 로컬 형식으로 바꾼다', () => {
  expect(toSqliteUtc('2026-10-06T01:15:00+00:00')).toBe('2026-10-06 01:15:00');
  expect(toSqliteUtc('2026-10-06T10:15:00+09:00')).toBe('2026-10-06 01:15:00');
  expect(toSqliteUtc(null)).toBeNull();
  expect(toWeekdayCsv([1, 2, 3])).toBe('1,2,3');
  expect(toWeekdayCsv(null)).toBeNull();
});

test('옛 로컬 데이터를 지우고 서버 id 그대로 바꾼다(첫 동기화)', async () => {
  // 서버에 없는 옛 로컬 할 일(시험용 등)
  await createTask(database, { title: '옛 할 일', repeatWeekdays: [0, 1, 2, 3, 4, 5, 6], taskDate: '', effectiveFrom: '2026-09-01' });
  await replaceLocalWithSnapshot(database, toLocalSnapshot(server));

  const tasks = await database.getAllAsync<{ id: number; title: string; repeat_weekdays: string | null; family_id: string }>('SELECT id, title, repeat_weekdays, family_id FROM tasks ORDER BY id');
  expect(tasks).toEqual([
    { id: 7001, title: '줄넘기', repeat_weekdays: '1,2,3', family_id: 'local-family' },
    { id: 7002, title: '준비물', repeat_weekdays: null, family_id: 'local-family' },
  ]);
  const active = await getActiveTimetableSet(database);
  expect(active?.id).toBe(301);
  expect(active?.name).toBe('채아');
  const tuesday = await getTimetableItemsForWeekday(database, 2, 301);
  expect(tuesday.map((item) => item.title).sort()).toEqual(['국어', '피아노']);
  // 화요일(2026-10-06) 오늘 할 일: 반복 줄넘기 + 날짜 준비물(완료)
  const today = await getTodayTasks(database, '2026-10-06', 2);
  expect(today.map((task) => [task.title, Boolean(task.completed)])).toEqual([['줄넘기', false], ['준비물', true]]);
  const gems = await getGemRightSummary(database, '2026-10-06');
  expect(gems.requested).toBe(1);
  const ledger = await database.getAllAsync<{ child_id: string; delta: number }>('SELECT child_id, delta FROM sticker_ledger');
  expect(ledger).toEqual([{ child_id: 'local-child', delta: 5 }]);
});

test('다시 받아와도 같은 결과(멱등)이고, 서버에서 지운 행은 로컬에서도 사라진다', async () => {
  await replaceLocalWithSnapshot(database, toLocalSnapshot(server));
  await replaceLocalWithSnapshot(database, toLocalSnapshot({ ...server, tt_tasks: [server.tt_tasks[0]], tt_task_completions: [], tt_task_completion_history: [] }));
  const titles = await database.getAllAsync<{ title: string }>('SELECT title FROM tasks');
  expect(titles).toEqual([{ title: '줄넘기' }]);
});

test('받아오는 도중 실패하면 원래 로컬 데이터가 그대로 남는다', async () => {
  await createTask(database, { title: '남아야 할 할 일', repeatWeekdays: [1], taskDate: '', effectiveFrom: '2026-09-01' });
  // 없는 세트를 가리키는 항목 → 외래키 위반으로 중간에 실패
  const broken = toLocalSnapshot({ ...server, tt_timetable_items: [{ ...server.tt_timetable_items[0], set_id: 999 }] });
  await expect(replaceLocalWithSnapshot(database, broken)).rejects.toThrow();
  const titles = await database.getAllAsync<{ title: string }>('SELECT title FROM tasks');
  expect(titles).toEqual([{ title: '남아야 할 할 일' }]);
});

test('가족에 연결된 계정만 동기화 대상이고, 상태 문구는 한글로 보인다', () => {
  expect(syncTarget({ kind: 'local' })).toBeNull();
  expect(syncTarget({ kind: 'signedIn', email: 'a', membership: null, offline: false })).toBeNull();
  expect(syncTarget({ kind: 'signedIn', email: 'a', membership: { role: 'child', familyId: FAMILY }, offline: true })).toEqual({ familyId: FAMILY, role: 'child' });
  const now = new Date(2026, 9, 6, 23, 30);
  expect(formatSyncTime(new Date(2026, 9, 6, 23, 10).toISOString(), now)).toBe('오늘 23:10');
  expect(formatSyncTime(new Date(2026, 9, 5, 8, 5).toISOString(), now)).toBe('10월 5일 08:05');
  expect(syncSummary({ state: 'syncing' }, null, now)).toBe('서버와 맞추는 중이에요.');
  expect(syncSummary({ state: 'idle' }, null, now)).toBe('마지막으로 맞춘 때: 아직 없음');
  expect(syncErrorMessage(new Error('Network request failed'))).toContain('인터넷이 연결되지 않아');
});
