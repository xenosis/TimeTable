import { setAccount } from '../src/store/accountStore';
import { hasSyncedFamily, NEEDS_IMPORT_MESSAGE, runSync } from '../src/sync/syncRunner';

const calls: string[] = [];
const mockFetch = jest.fn();
const mockReplace = jest.fn();
const mockServerHasData = jest.fn();
const mockHasLocalData = jest.fn();
const mockStatus = jest.fn();

jest.mock('../src/db/database', () => ({ getDatabase: async () => ({}) }));
jest.mock('../src/server/supabaseClient', () => ({ getSupabase: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }));
jest.mock('../src/widgets/widgetRefresh', () => ({
  applyPendingWidgetChecksNow: async () => { calls.push('pending'); return 0; },
  requestWidgetRefresh: async () => { calls.push('widget'); },
}));
jest.mock('../src/widgets/widgetChecksSignal', () => ({ notifyWidgetChecksApplied: () => calls.push('notify') }));
jest.mock('../src/notifications/rollingOwners', () => ({ refreshAllRollingOwners: async () => { calls.push('alarms'); } }));
jest.mock('../src/server/localImport', () => ({ readLocalPayload: async () => ({}), hasLocalData: () => mockHasLocalData() }));
jest.mock('../src/sync/syncStatus', () => ({ setSyncStatus: (status: unknown) => mockStatus(status) }));
jest.mock('../src/sync/pullSnapshot', () => ({
  NETWORK_ERROR: 'Network request failed',
  fetchLocalSnapshot: (...args: unknown[]) => { calls.push('fetch'); return mockFetch(...args); },
  replaceLocalWithSnapshot: (...args: unknown[]) => { calls.push(`replace:${String(args[2])}`); return mockReplace(...args); },
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
  mockFetch.mockResolvedValue({});
  mockReplace.mockResolvedValue(undefined);
  mockServerHasData.mockReturnValue(true);
  mockHasLocalData.mockReturnValue(false);
  signedIn('fam-1');
});

test('첫 동기화: 위젯 체크 반영 → 받아오기 → 서버 기준 통째 교체 → 화면 알림 → 알림·위젯 갱신, 이후는 폰 기록을 지킨다', async () => {
  await expect(runSync(target)).resolves.toBe(true);
  expect(calls).toEqual(['pending', 'fetch', 'replace:false', 'notify', 'alarms', 'widget']);
  expect(hasSyncedFamily('fam-1')).toBe(true);
  calls.length = 0;
  await runSync(target);
  expect(calls).toContain('replace:true');
});

test('같은 가족 동기화가 진행 중이면 한 번만 실행된다', async () => {
  const [a, b] = [runSync(target), runSync(target)];
  await Promise.all([a, b]);
  expect(calls.filter((call) => call === 'fetch')).toHaveLength(1);
});

test('서버가 비어 있고 폰에 데이터가 있으면 덮지 않고 올리기를 안내한다', async () => {
  mockServerHasData.mockReturnValue(false);
  mockHasLocalData.mockReturnValue(true);
  await expect(runSync(target)).resolves.toBe(false);
  expect(calls).not.toContain('replace:false');
  expect(hasSyncedFamily('fam-1')).toBe(false);
  expect(mockStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'error', message: NEEDS_IMPORT_MESSAGE }));
});

test('받아오기에 실패하면 로컬·동기화 기록·알림을 건드리지 않는다', async () => {
  mockFetch.mockRejectedValue(new Error('Network request failed'));
  await expect(runSync(target)).resolves.toBe(false);
  expect(calls).toEqual(['pending', 'fetch']);
  expect(memory.size).toBe(0);
  expect(mockStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'error', message: expect.stringContaining('인터넷이 연결되지 않아') }));
});

test('받아오는 사이 다른 가족으로 바뀌면 로컬을 바꾸지 않는다', async () => {
  mockFetch.mockImplementation(async () => { signedIn('fam-2'); return {}; });
  await expect(runSync(target)).resolves.toBe(false);
  expect(calls.some((call) => call.startsWith('replace'))).toBe(false);
});
