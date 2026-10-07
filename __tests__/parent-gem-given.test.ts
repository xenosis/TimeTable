import { markParentGemsGiven, pendingParentGemCount } from '../src/server/parentGemGiven';
import { setAccount } from '../src/store/accountStore';

const mockGetAll = jest.fn();
const mockRpc = jest.fn();
const mockRunSync = jest.fn<Promise<boolean>, [unknown]>().mockResolvedValue(true);
jest.mock('../src/db/database', () => ({ getDatabase: async () => ({ getAllAsync: mockGetAll }) }));
jest.mock('../src/server/supabaseClient', () => ({ getSupabase: () => ({ rpc: mockRpc }) }));
jest.mock('../src/sync/syncMarkers', () => ({ hasSyncedFamily: () => true }));
jest.mock('../src/sync/syncRunner', () => ({ runSync: (target: unknown) => mockRunSync(target) }));

beforeEach(() => {
  jest.clearAllMocks();
  const saved = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  } });
  setAccount({ kind: 'signedIn', email: 'dad@example.invalid', membership: { role: 'parent', familyId: 'fam-a' }, offline: false });
  mockGetAll.mockResolvedValue([{ id: 7 }, { id: 9 }]);
  mockRpc.mockResolvedValue({ data: 2, error: null });
});
test('응답 유실 후 동기화로 요청 목록이 바뀌어도 최초 ID로 재시도한다', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
  await expect(markParentGemsGiven(2)).rejects.toThrow('중복 지급되지 않아요');
  mockGetAll.mockResolvedValue([{ id: 10 }, { id: 11 }]);
  await expect(markParentGemsGiven(2)).resolves.toBe(2);
  expect(mockRpc).toHaveBeenLastCalledWith('tt_mark_gems_given', { p_family: 'fam-a', p_ids: [7, 9] });
  expect(mockGetAll).toHaveBeenCalledTimes(1);
});

test('서버가 지급을 확정 거부하면 대기를 해제하고 새 요청을 처리할 수 있다', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'TT_GIVEN: 요청이 없어졌어요.' } });
  await expect(markParentGemsGiven(2)).rejects.toThrow('요청이 없어졌어요');
  expect(pendingParentGemCount('fam-a')).toBe(0);
  expect(mockRunSync).toHaveBeenCalledTimes(1);
  mockGetAll.mockResolvedValue([{ id: 10 }, { id: 11 }]);
  await markParentGemsGiven(2);
  expect(mockRpc).toHaveBeenLastCalledWith('tt_mark_gems_given', { p_family: 'fam-a', p_ids: [10, 11] });
});

test.each(['{broken', '[7,7]', '[]', '["7"]'])('깨진 대기 기록 %s는 렌더를 실패시키지 않고 지급을 막는다', async (saved) => {
  globalThis.localStorage.setItem('tt.gems.pendingGiven.fam-a', saved);
  expect(pendingParentGemCount('fam-a')).toBe(-1);
  await expect(markParentGemsGiven(2)).rejects.toThrow();
  expect(mockRpc).not.toHaveBeenCalled();
  expect(globalThis.localStorage.getItem('tt.gems.pendingGiven.fam-a')).toBe(saved);
});
afterEach(() => setAccount({ kind: 'checking' }));

test('동기화된 요청 ID를 서버에 보내고 성공 뒤 다시 맞춘다', async () => {
  await expect(markParentGemsGiven(2)).resolves.toBe(2);
  expect(mockRpc).toHaveBeenCalledWith('tt_mark_gems_given', { p_family: 'fam-a', p_ids: [7, 9] });
  expect(mockRunSync).toHaveBeenCalledWith({ familyId: 'fam-a', role: 'parent' });
});
test('응답을 못 받아도 로컬 지급으로 성공 처리하지 않는다', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
  await expect(markParentGemsGiven(2)).rejects.toThrow('중복 지급되지 않아요');
  expect(mockRunSync).not.toHaveBeenCalled();
});
test('요청보다 많거나 딸 계정이면 서버에 보내지 않는다', async () => {
  await expect(markParentGemsGiven(3)).rejects.toThrow('요청된 보석은 2개');
  setAccount({ kind: 'signedIn', email: 'child@example.invalid', membership: { role: 'child', familyId: 'fam-a' }, offline: false });
  await expect(markParentGemsGiven(2)).rejects.toThrow('아빠 계정');
  expect(mockRpc).not.toHaveBeenCalled();
});
