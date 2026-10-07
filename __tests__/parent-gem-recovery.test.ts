import { confirmParentGemRecovery, loadParentGemRecovery } from '../src/server/parentGemRecovery';
import { setAccount } from '../src/store/accountStore';

const mockRows = jest.fn();
const mockSync = jest.fn<Promise<boolean>, [unknown]>().mockResolvedValue(true);
jest.mock('../src/db/database', () => ({ getDatabase: async () => ({ getAllAsync: () => mockRows() }) }));
jest.mock('../src/server/supabaseClient', () => ({ getSupabase: () => ({}) }));
jest.mock('../src/sync/syncRunner', () => ({ runSync: (target: unknown) => mockSync(target) }));

const key = 'tt.gems.pendingGiven.fam-a';
beforeEach(() => {
  jest.clearAllMocks();
  const saved = new Map<string, string>([[key, '{broken']]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (name: string) => saved.get(name) ?? null,
    setItem: (name: string, value: string) => saved.set(name, value),
    removeItem: (name: string) => saved.delete(name),
  } });
  setAccount({ kind: 'signedIn', email: 'dad@example.invalid', membership: { role: 'parent', familyId: 'fam-a' }, offline: false });
  mockSync.mockResolvedValue(true);
  mockRows.mockResolvedValue([{ id: 7, state: 'given', given_at: '2026-10-08T01:00:00Z' }, { id: 9, state: 'requested', given_at: null }]);
});
afterEach(() => setAccount({ kind: 'local' }));

test('서버 내역 조회만으로는 손상된 대기를 지우지 않고 확인 후에만 복구한다', async () => {
  const reviewed = await loadParentGemRecovery();
  expect(reviewed).toMatchObject({ requested: 1, given: 1, latestGiven: ['2026-10-08T01:00:00Z'] });
  expect(globalThis.localStorage.getItem(key)).toBe('{broken');
  await confirmParentGemRecovery(reviewed);
  expect(globalThis.localStorage.getItem(key)).toBeNull();
  expect(mockSync).toHaveBeenCalledTimes(2);
});

test('서버에 연결하지 못하면 대기를 보존한다', async () => {
  mockSync.mockResolvedValue(false);
  await expect(loadParentGemRecovery()).rejects.toThrow('인터넷 연결');
  expect(mockRows).not.toHaveBeenCalled();
  expect(globalThis.localStorage.getItem(key)).toBe('{broken');
});

test('확인 뒤 지급 내역이 바뀌면 다시 확인하게 하고 대기를 보존한다', async () => {
  const reviewed = await loadParentGemRecovery();
  mockRows.mockResolvedValue([{ id: 7, state: 'given', given_at: '2026-10-08T01:00:00Z' }]);
  await expect(confirmParentGemRecovery(reviewed)).rejects.toThrow('최신 내역');
  expect(globalThis.localStorage.getItem(key)).toBe('{broken');
});

test('내역 확인 뒤 딸 계정으로 바뀌면 대기를 지우지 않는다', async () => {
  const reviewed = await loadParentGemRecovery();
  setAccount({ kind: 'signedIn', email: 'child@example.invalid', membership: { role: 'child', familyId: 'fam-a' }, offline: false });
  await expect(confirmParentGemRecovery(reviewed)).rejects.toThrow('아빠 계정');
  expect(globalThis.localStorage.getItem(key)).toBe('{broken');
});
