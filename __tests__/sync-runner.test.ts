import { setAccount, setAccountByUser } from '../src/store/accountStore';
import { hasSyncedFamily, NEEDS_IMPORT_MESSAGE, resyncFromServer, runSync } from '../src/sync/syncRunner';
import { bumpChildChangeVersion } from '../src/db/childChangeVersion';

const calls: string[] = [];
const mockFetch = jest.fn();
const mockReplace = jest.fn();
const mockServerHasData = jest.fn();
const mockHasLocalData = jest.fn();
const mockStatus = jest.fn();

jest.mock('../src/db/database', () => ({ getDatabase: async () => ({}) }));
const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock('../src/server/supabaseClient', () => ({ getSupabase: () => ({ from: (...args: unknown[]) => mockFrom(...args), rpc: (...args: unknown[]) => mockRpc(...args), auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: { user: { id: 'child-uid' } } } }) } }) }));
const mockPush = jest.fn();
jest.mock('../src/sync/pushChildRecords', () => ({ pushChildRecords: (...args: unknown[]) => { calls.push('push'); return mockPush(...args); } }));
jest.mock('../src/widgets/widgetRefresh', () => ({
  applyPendingWidgetChecksNow: async () => { calls.push('pending'); return 0; },
  requestWidgetRefresh: async () => { calls.push('widget'); },
}));
jest.mock('../src/widgets/widgetChecksSignal', () => ({ notifyWidgetChecksApplied: () => calls.push('notify') }));
jest.mock('../src/notifications/rollingOwners', () => ({ refreshAllRollingOwners: async () => { calls.push('alarms'); } }));
jest.mock('../src/server/localImport', () => ({ readLocalPayload: async () => ({}), hasLocalData: () => mockHasLocalData() }));
jest.mock('../src/sync/syncStatus', () => ({ setSyncStatus: (status: unknown) => mockStatus(status) }));
const mockSoon = jest.fn();
jest.mock('../src/sync/syncSoon', () => ({ requestSyncSoon: () => mockSoon() }));
jest.mock('../src/sync/pullSnapshot', () => ({
  NETWORK_ERROR: 'Network request failed',
  fetchLocalSnapshot: (...args: unknown[]) => { calls.push('fetch'); return mockFetch(...args); },
  replaceLocalWithSnapshot: (...args: unknown[]) => {
    const keep = typeof args[2] === 'function' ? (args[2] as () => boolean)() : args[2];
    calls.push(`replace:${String(keep)}`);
    return mockReplace(...args);
  },
  serverHasFamilyData: () => mockServerHasData(),
}));

const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) },
});

const target = { familyId: 'fam-1', role: 'child' } as const;
const signedIn = (familyId: string) => setAccount({ kind: 'signedIn', email: 'kid@example.com', membership: { role: 'child', familyId }, offline: false });

beforeEach(() => {
  calls.length = 0;
  memory.clear();
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({ timetable_sets: [{ id: 1, name: '채아' }] });
  mockRpc.mockResolvedValue({ error: null });
  mockReplace.mockResolvedValue(undefined);
  mockPush.mockResolvedValue(0);
  mockServerHasData.mockReturnValue(true);
  mockHasLocalData.mockReturnValue(false);
  signedIn('fam-1');
});

test('같은 가족의 아빠 조회 중 딸 계정으로 전환하면 이전 결과로 딸 체크를 덮지 않는다', async () => {
  setAccount({ kind: 'signedIn', email: 'dad@example.com', membership: { role: 'parent', familyId: 'fam-1' }, offline: false });
  let complete!: (value: unknown) => void;
  mockFetch.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  const previous = runSync({ familyId: 'fam-1', role: 'parent' });
  await new Promise((resolve) => setImmediate(resolve));
  signedIn('fam-1');
  bumpChildChangeVersion();
  complete({ timetable_sets: [{ id: 1, name: '채아' }] });
  await expect(previous).resolves.toBe(false);
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockSoon).toHaveBeenCalled();
});

test('같은 역할로 다시 로그인해도 이전 로그인에서 시작한 조회는 적용하지 않는다', async () => {
  let complete!: (value: unknown) => void;
  mockFetch.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  const previous = runSync(target);
  await new Promise((resolve) => setImmediate(resolve));
  setAccountByUser({ kind: 'local' });
  setAccountByUser({ kind: 'signedIn', email: 'kid@example.com', membership: { role: 'child', familyId: 'fam-1' }, offline: false });
  complete({ timetable_sets: [{ id: 1, name: '채아' }] });
  await expect(previous).resolves.toBe(false);
  expect(mockReplace).not.toHaveBeenCalled();
});

test('첫 동기화는 올리지 않고 서버 기준으로 바꾸고, 그 뒤로는 폰 기록을 먼저 올린 뒤 서버 내용으로 맞춘다', async () => {
  await expect(runSync(target)).resolves.toBe(true);
  expect(calls).toEqual(['pending', 'fetch', 'replace:false', 'notify', 'alarms', 'widget']);
  expect(hasSyncedFamily('fam-1')).toBe(true);
  calls.length = 0;
  await runSync(target);
  expect(calls).toEqual(['pending', 'push', 'fetch', 'replace:false', 'notify', 'alarms', 'widget']);
  expect(mockPush).toHaveBeenCalledWith({}, 'fam-1', 'child-uid');
});

test('올리는 사이 폰에서 새 체크가 생기면 폰 기록을 지키고(다음에 올림), 아빠 계정은 올리지 않는다', async () => {
  await runSync(target);
  calls.length = 0;
  mockPush.mockImplementationOnce(async () => { bumpChildChangeVersion(); return 1; });
  await runSync(target);
  expect(calls).toContain('replace:true');
  expect(mockSoon).toHaveBeenCalledTimes(1); // 지켜 둔 새 체크를 곧 다시 올린다
  calls.length = 0;
  setAccount({ kind: 'signedIn', email: 'dad@example.com', membership: { role: 'parent', familyId: 'fam-1' }, offline: false });
  await runSync({ familyId: 'fam-1', role: 'parent' });
  expect(calls).not.toContain('push');
  expect(calls).toContain('replace:false');
});

test('올리기에 실패하면 받아오지 않고 폰 데이터를 그대로 둔다(다음에 다시 올림)', async () => {
  await runSync(target);
  calls.length = 0;
  mockPush.mockRejectedValueOnce(new Error('Network request failed'));
  await expect(runSync(target)).resolves.toBe(false);
  expect(calls).toEqual(['pending', 'push']);
});

test('같은 가족 동기화가 도는 중에 온 요청은 합쳐 기다리고, 끝난 뒤 한 번만 더 맞춘다(그사이 새 변경을 놓치지 않게)', async () => {
  const [a, b, c] = [runSync(target), runSync(target), runSync(target)];
  await Promise.all([a, b, c]);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  expect(calls.filter((call) => call === 'fetch')).toHaveLength(2);
});

test('서버가 비어 있고 폰에 데이터가 있으면 덮지 않고 올리기를 안내한다', async () => {
  mockServerHasData.mockReturnValue(false);
  mockHasLocalData.mockReturnValue(true);
  await expect(runSync(target)).resolves.toBe(false);
  expect(calls).not.toContain('replace:false');
  expect(hasSyncedFamily('fam-1')).toBe(false);
  expect(mockStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'error', message: NEEDS_IMPORT_MESSAGE }));
});

test('직접 고른 서버 내용으로 다시 맞추기는 서버가 비어 있어도 서버 기준으로 바꾼다(올리지 않음)', async () => {
  await runSync(target);
  mockServerHasData.mockReturnValue(false);
  mockHasLocalData.mockReturnValue(true);
  calls.length = 0;
  await expect(resyncFromServer(target)).resolves.toBe(true);
  expect(calls).toEqual(['pending', 'fetch', 'replace:false', 'notify', 'alarms', 'widget']);
});

test('서버 가족에 시간표 세트가 없으면 서버에 기본 세트 평소를 만든 뒤 다시 받아온다', async () => {
  mockFetch.mockResolvedValueOnce({ timetable_sets: [] }).mockResolvedValueOnce({ timetable_sets: [{ id: 1_000_000_001, name: '평소' }] });
  await expect(runSync(target)).resolves.toBe(true);
  expect(mockRpc).toHaveBeenCalledWith('tt_apply_family_edit', expect.objectContaining({ p_family: 'fam-1', p_edit: expect.objectContaining({ inserts: { tt_timetable_sets: [expect.objectContaining({ name: '평소' })] } }) }));
  expect(calls.filter((call) => call === 'fetch')).toHaveLength(2);
});

test('편집과 동기화는 같은 잠금을 써서 겹치지 않는다', async () => {
  const { withSyncLock } = jest.requireActual('../src/sync/syncLock') as typeof import('../src/sync/syncLock');
  let releaseEdit: () => void = () => undefined;
  const edit = withSyncLock(() => new Promise<void>((resolve) => { calls.push('edit-start'); releaseEdit = () => { calls.push('edit-end'); resolve(); }; }));
  const sync = runSync(target);
  await new Promise((resolve) => setImmediate(resolve));
  expect(calls).toEqual(['edit-start']); // 편집이 끝나기 전에는 동기화가 시작되지 않는다
  releaseEdit();
  await Promise.all([edit, sync]);
  expect(calls.slice(0, 3)).toEqual(['edit-start', 'edit-end', 'pending']);
});

test('받아오기에 실패하면 로컬·동기화 기록·알림을 건드리지 않는다', async () => {
  mockFetch.mockRejectedValue(new Error('Network request failed'));
  await expect(runSync(target)).resolves.toBe(false);
  expect(calls).toEqual(['pending', 'fetch']);
  expect(memory.size).toBe(0);
  expect(mockStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'error', message: expect.stringContaining('인터넷이 연결되지 않아') }));
});

test.each([503, 401])('실제 서버 조회가 장애 응답 %i를 받아도 빈 스냅샷으로 로컬을 지우지 않는다', async (status) => {
  const query = {
    select: jest.fn(), eq: jest.fn(), order: jest.fn(),
    range: jest.fn(async () => ({ data: null, error: { message: 'Service unavailable', code: String(status) }, status })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  mockFrom.mockReturnValue(query);
  const actual = jest.requireActual('../src/sync/pullSnapshot') as typeof import('../src/sync/pullSnapshot');
  mockFetch.mockImplementation(actual.fetchLocalSnapshot);
  await expect(runSync(target)).resolves.toBe(false);
  expect(query.range).toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(calls).toEqual(['pending', 'fetch']);
  expect(memory.size).toBe(0);
});

test('받아오는 사이 다른 가족으로 바뀌면 로컬을 바꾸지 않는다', async () => {
  mockFetch.mockImplementation(async () => { signedIn('fam-2'); return { timetable_sets: [{ id: 1 }] }; });
  await expect(runSync(target)).resolves.toBe(false);
  expect(calls.some((call) => call.startsWith('replace'))).toBe(false);
});
