/** @jest-environment node */
import { migrateDatabase } from '../src/db/migrations';
import { createTask, deleteTask } from '../src/db/taskRepository';
import { createTimetableSet } from '../src/db/timetableSetRepository';
import { diffParentTables, OFFLINE_EDIT_MESSAGE, runAdminEdit, toServerRow } from '../src/sync/adminEdit';
import { setAccount } from '../src/store/accountStore';
import { markSynced } from '../src/sync/syncMarkers';
import { openTestDatabase } from '../test-utils/sqliteTestDatabase';

let mockDatabase: ReturnType<typeof openTestDatabase>;
const mockCalls: { table: string; op: string; payload: unknown }[] = [];
let mockFail = false;
const mockSoon = jest.fn();

jest.mock('../src/db/database', () => ({ getDatabase: async () => mockDatabase }));
jest.mock('../src/sync/syncSoon', () => ({ requestSyncSoon: () => mockSoon() }));
jest.mock('../src/sync/syncRunner', () => ({
  syncTarget: (account: { kind: string; membership?: { familyId: string; role: string } | null }) => (account.kind === 'signedIn' && account.membership ? { familyId: account.membership.familyId, role: account.membership.role } : null),
  hasSyncedFamily: (familyId: string) => jest.requireActual('../src/sync/syncMarkers').hasSyncedFamily(familyId),
}));
jest.mock('../src/server/supabaseClient', () => ({
  getSupabase: () => ({
    from: (table: string) => ({
      upsert: async (payload: unknown) => { mockCalls.push({ table, op: 'upsert', payload }); return { error: mockFail ? { message: 'Network request failed' } : null }; },
      delete: () => ({ eq: () => ({ in: async (_: string, ids: unknown) => { mockCalls.push({ table, op: 'delete', payload: ids }); return { error: mockFail ? { message: 'Network request failed' } : null }; } }) }),
    }),
  }),
}));

const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) },
});

const FAMILY = 'fam-1';
const everyDay = [0, 1, 2, 3, 4, 5, 6];
const titles = async () => (await mockDatabase.getAllAsync<{ title: string }>('SELECT title FROM tasks ORDER BY id')).map((row) => row.title);

beforeEach(async () => {
  mockDatabase = openTestDatabase();
  await migrateDatabase(mockDatabase);
  memory.clear();
  mockCalls.length = 0;
  mockFail = false;
  jest.clearAllMocks();
  setAccount({ kind: 'signedIn', email: 'kid@example.com', membership: { role: 'child', familyId: FAMILY }, offline: false });
  markSynced(FAMILY, new Date().toISOString());
});

test('로그인해 서버와 맞춘 폰의 편집은 바뀐 행만 서버에 저장하고(로컬 id 그대로, 요일은 배열), 곧 다시 맞춘다', async () => {
  await runAdminEdit(() => createTask(mockDatabase, { title: '줄넘기', repeatWeekdays: [1, 3], taskDate: '', effectiveFrom: '2026-10-01' }));
  const id = (await mockDatabase.getFirstAsync<{ id: number }>("SELECT id FROM tasks WHERE title = '줄넘기'"))!.id;
  expect(mockCalls).toEqual([{ table: 'tt_tasks', op: 'upsert', payload: [expect.objectContaining({ id, family_id: FAMILY, title: '줄넘기', repeat_weekdays: [1, 3] })] }]);
  expect(mockSoon).toHaveBeenCalledTimes(1);
  mockCalls.length = 0;
  await runAdminEdit(() => deleteTask(mockDatabase, id));
  expect(mockCalls).toEqual([{ table: 'tt_tasks', op: 'delete', payload: [id] }]);
});

test('인터넷이 없어 서버 저장에 실패하면 폰의 편집을 되돌리고 안내한다', async () => {
  await createTask(mockDatabase, { title: '원래 할 일', repeatWeekdays: everyDay, taskDate: '', effectiveFrom: '2026-10-01' });
  mockFail = true;
  await expect(runAdminEdit(() => createTask(mockDatabase, { title: '새 할 일', repeatWeekdays: everyDay, taskDate: '', effectiveFrom: '2026-10-01' }))).rejects.toThrow(OFFLINE_EDIT_MESSAGE);
  expect(await titles()).toEqual(['원래 할 일']);
  expect(mockSoon).not.toHaveBeenCalled();
});

test('로그인하지 않았거나 아직 서버와 맞추지 않은 폰은 지금처럼 로컬에만 저장한다', async () => {
  setAccount({ kind: 'local' });
  await runAdminEdit(() => createTask(mockDatabase, { title: '로컬 할 일', repeatWeekdays: everyDay, taskDate: '', effectiveFrom: '2026-10-01' }));
  setAccount({ kind: 'signedIn', email: 'kid@example.com', membership: { role: 'child', familyId: FAMILY }, offline: false });
  memory.clear();
  await runAdminEdit(() => createTask(mockDatabase, { title: '맞추기 전 할 일', repeatWeekdays: everyDay, taskDate: '', effectiveFrom: '2026-10-01' }));
  expect(mockCalls).toEqual([]);
  expect(await titles()).toEqual(['로컬 할 일', '맞추기 전 할 일']);
});

test('세트를 복사해 만들면 세트와 항목이 함께 저장되고, 세트 먼저 넣는 순서다', async () => {
  const before = { timetable_sets: await mockDatabase.getAllAsync('SELECT * FROM timetable_sets'), timetable_items: [] };
  await createTimetableSet(mockDatabase, '방학', {});
  const after = { timetable_sets: await mockDatabase.getAllAsync('SELECT * FROM timetable_sets'), timetable_items: [] };
  const diffs = diffParentTables(before as never, after as never);
  expect(diffs.map((diff) => diff.table)).toEqual(['timetable_sets']);
  expect(diffs[0].upserts.map((row) => row.name)).toEqual(['방학']);
});

test('서버 행으로 바꿀 때 옛 열은 빼고 시각은 ISO로 바꾼다', () => {
  const row = toServerRow('timetable_items', { id: 3, family_id: 'local-family', set_id: 1, weekday: 2, period_no: null, start_time: '16:00', end_time: '17:00', title: '피아노', category: 'academy', color_key: 'music', icon_key: 'music-note', alert_mode: 'none', alert_before_min: 0, memo: '', created_at: '2026-10-07 01:00:00', timetable_mode: 'regular' }, FAMILY);
  expect(row).not.toHaveProperty('timetable_mode');
  expect(row).toMatchObject({ family_id: FAMILY, created_at: '2026-10-07T01:00:00Z' });
  expect(toServerRow('timetable_settings', { family_id: 'local-family', active_set_id: 9, active_mode: 'regular' }, FAMILY)).toEqual({ family_id: FAMILY, active_set_id: 9 });
});
