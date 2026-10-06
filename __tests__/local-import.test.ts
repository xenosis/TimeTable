import { canImport, countsMatch, hasLocalData, importAlreadyDone, importErrorMessage, importLocalData, readLocalPayload, type ImportPayload } from '../src/server/localImport';
import { importSummary } from '../src/components/LocalImportPanel';

const mockRpc = jest.fn();
const mockGetAllAsync = jest.fn();

jest.mock('../src/server/supabaseClient', () => ({ getSupabase: () => ({ rpc: mockRpc }) }));
jest.mock('../src/db/database', () => ({ getDatabase: async () => ({ getAllAsync: mockGetAllAsync }) }));

const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) },
});

// 로컬 테이블별 가짜 행(SQL 문장의 테이블 이름으로 고른다)
const rows: Record<string, unknown[]> = {
  periods: [{ id: 1, period_no: 1 }],
  timetable_sets: [{ id: 5, name: '평소' }],
  timetable_items: [{ id: 100, set_id: 5 }, { id: 101, set_id: 5 }],
  day_exceptions: [],
  tasks: [{ id: 10, repeat_weekdays: '1,3,5' }],
  sticker_ledger: [{ id: 1, delta: 3 }],
  rewards: [],
  gem_rights: [{ id: 1, state: 'given' }],
  timetable_settings: [{ active_set_id: 5 }],
  task_completions: [{ id: 1, task_id: 10 }],
  task_completion_history: [{ task_id: 10, completion_date: '2026-10-05' }],
};
function fakeQuery(sql: string): Promise<unknown[]> {
  const table = /FROM (\w+)/.exec(sql)?.[1] ?? '';
  return Promise.resolve(rows[table] ?? []);
}

const child = { kind: 'signedIn', email: 'kid@example.com', membership: { role: 'child', familyId: 'fam-1' }, offline: false } as const;
const expectedCounts = { periods: 1, timetable_sets: 1, timetable_settings: 1, timetable_items: 2, day_exceptions: 0, tasks: 1, task_completions: 1, task_completion_history: 1, sticker_ledger: 1, rewards: 0, gem_rights: 1 };

beforeEach(() => {
  memory.clear();
  jest.clearAllMocks();
  mockGetAllAsync.mockImplementation(fakeQuery);
});

test('로컬 행을 가공 없이 모으고, family_id가 없는 완료 기록은 할 일을 거쳐 이 가족 것만 고른다', async () => {
  const payload = await readLocalPayload({ getAllAsync: mockGetAllAsync });
  expect(payload.tasks).toEqual([{ id: 10, repeat_weekdays: '1,3,5' }]);
  expect(payload.timetable_settings).toEqual({ active_set_id: 5 });
  expect(payload.task_completions).toHaveLength(1);
  const sqls = mockGetAllAsync.mock.calls.map((call) => call[0] as string);
  expect(sqls.find((sql) => sql.includes('task_completions'))).toContain('JOIN tasks t ON t.id = c.task_id WHERE t.family_id = ?');
  for (const call of mockGetAllAsync.mock.calls) expect(call[1]).toBe('local-family');
});

test('딸 계정·온라인·가족 연결일 때만 이전할 수 있다', () => {
  expect(canImport(child)).toBe(true);
  expect(canImport({ ...child, membership: { role: 'parent', familyId: 'fam-1' } })).toBe(false);
  expect(canImport({ ...child, offline: true })).toBe(false);
  expect(canImport({ ...child, membership: null })).toBe(false);
  expect(canImport({ kind: 'local' })).toBe(false);
});

test('빈 폰은 올리지 않고, 서버 개수가 로컬과 다르면 성공으로 보지 않는다', async () => {
  const payload = await readLocalPayload({ getAllAsync: mockGetAllAsync });
  expect(hasLocalData(payload)).toBe(true);
  const empty = Object.fromEntries(Object.keys(payload).map((key) => [key, key === 'timetable_settings' ? null : []])) as unknown as ImportPayload;
  expect(hasLocalData(empty)).toBe(false);
  expect(countsMatch(payload, expectedCounts)).toBe(true);
  expect(countsMatch(payload, { ...expectedCounts, tasks: 0 })).toBe(false);
  expect(countsMatch(payload, { ...expectedCounts, timetable_settings: 0 })).toBe(false);
});

test('서버로 한 번 올리면 개수를 확인하고 이 가족을 이전 완료로 기록한다', async () => {
  mockRpc.mockResolvedValue({ data: expectedCounts, error: null });
  await expect(importLocalData('fam-1')).resolves.toEqual(expectedCounts);
  expect(mockRpc).toHaveBeenCalledWith('tt_import_local', expect.objectContaining({ p_family: 'fam-1' }));
  expect(importAlreadyDone('fam-1')).toBe(true);
  expect(importAlreadyDone('fam-2')).toBe(false);
  expect(importSummary(expectedCounts)).toBe('시간표 항목 2개, 할 일 1개, 완료 기록 1개, 보석 기록 2개');
});

test('서버가 거부하거나 개수가 다르면 이전 완료로 기록하지 않고 한글 이유를 보인다', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'TT_IMPORT: 서버에 이미 이 가족의 데이터가 있습니다' } });
  await expect(importLocalData('fam-1')).rejects.toThrow('서버에 이미 이 가족의 데이터가 있습니다');
  mockRpc.mockResolvedValueOnce({ data: { ...expectedCounts, tasks: 0 }, error: null });
  await expect(importLocalData('fam-1')).rejects.toThrow('서버에 올라간 개수가 이 폰과 달라요');
  expect(importAlreadyDone('fam-1')).toBe(false);
  expect(importErrorMessage({ message: 'Network request failed' })).toBe('인터넷 연결을 확인한 뒤 다시 해 주세요.');
  expect(importErrorMessage({ message: 'duplicate key' })).toContain('이 폰의 데이터는 그대로예요');
});

test('로컬에 데이터가 없으면 서버를 부르지 않는다', async () => {
  mockGetAllAsync.mockResolvedValue([]);
  await expect(importLocalData('fam-1')).rejects.toThrow('이 폰에 올릴 데이터가 없어요.');
  expect(mockRpc).not.toHaveBeenCalled();
});
