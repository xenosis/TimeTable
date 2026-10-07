/** @jest-environment node */
import { migrateDatabase } from '../src/db/migrations';
import { createTask, deleteTask, updateTask } from '../src/db/taskRepository';
import { createTimetableSet, getActiveTimetableSet } from '../src/db/timetableSetRepository';
import { createTimetableItems } from '../src/db/timetableRepository';
import { buildEditPayload, diffParentTables, editErrorMessage, NOT_SYNCED_MESSAGE, OFFLINE_EDIT_MESSAGE, runAdminEdit, toServerRow } from '../src/sync/adminEdit';
import { setAccount } from '../src/store/accountStore';
import { markSynced } from '../src/sync/syncMarkers';
import { openTestDatabase } from '../test-utils/sqliteTestDatabase';

let mockDatabase: ReturnType<typeof openTestDatabase>;
const mockRpcCalls: { fn: string; args: { p_family: string; p_edit: Record<string, Record<string, unknown[]> | null> } }[] = [];
let mockRpcResult: () => Promise<{ error: { message: string } | null }> = async () => ({ error: null });
const mockSoon = jest.fn();

jest.mock('../src/db/database', () => ({ getDatabase: async () => mockDatabase }));
jest.mock('../src/sync/syncSoon', () => ({ requestSyncSoon: () => mockSoon() }));
jest.mock('../src/sync/syncRunner', () => ({
  syncTarget: (account: { kind: string; membership?: { familyId: string; role: string } | null }) => (account.kind === 'signedIn' && account.membership ? { familyId: account.membership.familyId, role: account.membership.role } : null),
}));
jest.mock('../src/server/supabaseClient', () => ({
  getSupabase: () => ({ rpc: async (fn: string, args: never) => { mockRpcCalls.push({ fn, args }); return mockRpcResult(); } }),
}));

const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) },
});

const FAMILY = 'fam-1';
const everyDay = [0, 1, 2, 3, 4, 5, 6];
const titles = async () => (await mockDatabase.getAllAsync<{ title: string }>('SELECT title FROM tasks ORDER BY id')).map((row) => row.title);
const signedIn = () => setAccount({ kind: 'signedIn', email: 'kid@example.com', membership: { role: 'child', familyId: FAMILY }, offline: false });

beforeEach(async () => {
  mockDatabase = openTestDatabase();
  await migrateDatabase(mockDatabase);
  memory.clear();
  mockRpcCalls.length = 0;
  mockRpcResult = async () => ({ error: null });
  jest.clearAllMocks();
  signedIn();
  markSynced(FAMILY, new Date().toISOString());
});

test('서버와 맞춘 폰의 편집은 바뀐 행을 서버 함수 하나로 보낸다(새 행은 inserts, 고친 행은 updates, 지운 행은 deletes)', async () => {
  await runAdminEdit(() => createTask(mockDatabase, { title: '줄넘기', repeatWeekdays: [1, 3], taskDate: '', effectiveFrom: '2026-10-01' }));
  const id = (await mockDatabase.getFirstAsync<{ id: number }>("SELECT id FROM tasks WHERE title = '줄넘기'"))!.id;
  expect(mockRpcCalls).toHaveLength(1);
  expect(mockRpcCalls[0].fn).toBe('tt_apply_family_edit');
  expect(mockRpcCalls[0].args.p_family).toBe(FAMILY);
  expect(mockRpcCalls[0].args.p_edit.inserts).toEqual({ tt_tasks: [expect.objectContaining({ id, title: '줄넘기', repeat_weekdays: [1, 3] })] });
  expect(mockSoon).toHaveBeenCalledTimes(1);

  await runAdminEdit(() => updateTask(mockDatabase, id, { title: '줄넘기 100번', repeatWeekdays: [1, 3], taskDate: '', effectiveFrom: '2026-10-01' }));
  expect(mockRpcCalls[1].args.p_edit.updates).toEqual({ tt_tasks: [expect.objectContaining({ id, title: '줄넘기 100번' })] });
  expect(mockRpcCalls[1].args.p_edit.inserts).toEqual({});

  await runAdminEdit(() => deleteTask(mockDatabase, id));
  expect(mockRpcCalls[2].args.p_edit.deletes).toEqual({ tt_tasks: [id] });
});

test('서버가 거부하면 가족 데이터만 편집 전으로 되돌리고, 그 사이 생긴 체크·보석 기록은 지킨다', async () => {
  await createTask(mockDatabase, { title: '원래 할 일', repeatWeekdays: everyDay, taskDate: '', effectiveFrom: '2026-10-01' });
  const keepId = (await mockDatabase.getFirstAsync<{ id: number }>("SELECT id FROM tasks WHERE title = '원래 할 일'"))!.id;
  // 서버 응답을 기다리는 사이 딸이 체크하고 보석 장부가 바뀐 상황
  mockRpcResult = async () => {
    await mockDatabase.runAsync("INSERT INTO task_completions (task_id, completion_date) VALUES (?, '2026-10-07')", keepId);
    await mockDatabase.runAsync("INSERT INTO sticker_ledger (family_id, child_id, delta, reason) VALUES ('local-family', 'local-child', 2, 'manual-count:gem')");
    return { error: { message: 'Network request failed' } };
  };
  await expect(runAdminEdit(() => createTask(mockDatabase, { title: '새 할 일', repeatWeekdays: everyDay, taskDate: '', effectiveFrom: '2026-10-01' }))).rejects.toThrow(OFFLINE_EDIT_MESSAGE);
  expect(await titles()).toEqual(['원래 할 일']);
  expect(await mockDatabase.getAllAsync('SELECT task_id FROM task_completions')).toEqual([{ task_id: keepId }]);
  expect(await mockDatabase.getAllAsync('SELECT delta FROM sticker_ledger')).toEqual([{ delta: 2 }]);
  expect(mockSoon).not.toHaveBeenCalled();
});

test('서버 함수 호출 자체가 예외를 던져도 되돌린다', async () => {
  mockRpcResult = async () => { throw new Error('fetch failed'); };
  await expect(runAdminEdit(() => createTask(mockDatabase, { title: '새 할 일', repeatWeekdays: everyDay, taskDate: '', effectiveFrom: '2026-10-01' }))).rejects.toThrow(OFFLINE_EDIT_MESSAGE);
  expect(await titles()).toEqual([]);
});

test('로컬 모드는 지금처럼 로컬에만 저장하고, 로그인했지만 아직 서버와 맞추지 않은 폰은 편집을 막는다', async () => {
  setAccount({ kind: 'local' });
  await runAdminEdit(() => createTask(mockDatabase, { title: '로컬 할 일', repeatWeekdays: everyDay, taskDate: '', effectiveFrom: '2026-10-01' }));
  signedIn();
  memory.clear();
  await expect(runAdminEdit(() => createTask(mockDatabase, { title: '맞추기 전 할 일', repeatWeekdays: everyDay, taskDate: '', effectiveFrom: '2026-10-01' }))).rejects.toThrow(NOT_SYNCED_MESSAGE);
  expect(mockRpcCalls).toEqual([]);
  expect(await titles()).toEqual(['로컬 할 일']);
});

test('세트를 복사해 만들면 새 세트와 복사된 항목이 함께 inserts로 가고(세트 먼저), 적용 세트는 그대로다', async () => {
  const active = await getActiveTimetableSet(mockDatabase);
  await createTimetableItems(mockDatabase, [1, 2], { title: '수학', category: 'school', colorKey: 'math', iconKey: 'number', startTime: '09:00', endTime: '09:40', setId: active!.id } as never);
  const before = { timetable_sets: await mockDatabase.getAllAsync('SELECT * FROM timetable_sets'), timetable_items: await mockDatabase.getAllAsync('SELECT * FROM timetable_items') };
  await createTimetableSet(mockDatabase, '방학', { copyFromSetId: active!.id });
  const after = { timetable_sets: await mockDatabase.getAllAsync('SELECT * FROM timetable_sets'), timetable_items: await mockDatabase.getAllAsync('SELECT * FROM timetable_items') };
  const payload = buildEditPayload(diffParentTables(before as never, after as never)) as { inserts: Record<string, { name?: string; title?: string; set_id?: number; id?: number }[]> };
  expect(Object.keys(payload.inserts)).toEqual(['tt_timetable_sets', 'tt_timetable_items']);
  const newSet = payload.inserts.tt_timetable_sets[0];
  expect(newSet.name).toBe('방학');
  expect(payload.inserts.tt_timetable_items.map((item) => [item.title, item.set_id])).toEqual([['수학', newSet.id], ['수학', newSet.id]]);
});

test('서버 행으로 바꿀 때 옛 열·가족 id는 빼고 시각은 ISO로, 서버 거부 사유는 한글로 보인다', () => {
  const row = toServerRow('timetable_items', { id: 3, family_id: 'local-family', set_id: 1, weekday: 2, period_no: null, start_time: '16:00', end_time: '17:00', title: '피아노', category: 'academy', color_key: 'music', icon_key: 'music-note', alert_mode: 'none', alert_before_min: 0, memo: '', created_at: '2026-10-07 01:00:00', timetable_mode: 'regular' });
  expect(row).not.toHaveProperty('timetable_mode');
  expect(row).not.toHaveProperty('family_id');
  expect(row).toMatchObject({ created_at: '2026-10-07T01:00:00Z' });
  expect(buildEditPayload([{ table: 'timetable_settings', inserts: [], updates: [{ family_id: 'local-family', active_set_id: 9 }], deletes: [] }])).toMatchObject({ settings: { active_set_id: 9 } });
  expect(editErrorMessage('TT_EDIT: 다른 기기에서 지운 항목이에요. 서버와 다시 맞춘 뒤 해 주세요')).toBe('다른 기기에서 지운 항목이에요. 서버와 다시 맞춘 뒤 해 주세요 바꾼 내용은 저장하지 않았어요.');
  expect(editErrorMessage('Network request failed')).toBe(OFFLINE_EDIT_MESSAGE);
});
