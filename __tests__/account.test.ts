import { parseMembership, restoreAccount, signIn, signInErrorMessage, signOut } from '../src/server/account';
import { accountSummary } from '../src/components/AccountPanel';
import { isParentDevice } from '../src/store/accountStore';

const mockGetSession = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignOut = jest.fn();
const mockMaybeSingle = jest.fn();
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

jest.mock('../src/server/supabaseClient', () => ({
  getSupabase: () => ({
    auth: { getSession: mockGetSession, signInWithPassword: mockSignInWithPassword, signOut: mockSignOut },
    from: mockFrom,
  }),
}));

// 로그인 정보·역할 캐시가 쓰는 localStorage를 테스트용 메모리 저장소로 대신한다
const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) },
});

const dad = { id: 'user-dad', email: 'dad@example.com' };

beforeEach(() => {
  memory.clear();
  jest.clearAllMocks();
});

describe('parseMembership', () => {
  test('parent·child 역할과 가족 id가 있으면 소속으로 본다', () => {
    expect(parseMembership({ role: 'parent', family_id: 'f1' })).toEqual({ role: 'parent', familyId: 'f1' });
    expect(parseMembership({ role: 'child', family_id: 'f1' })).toEqual({ role: 'child', familyId: 'f1' });
  });
  test('행이 없거나 모양이 다르면 소속 없음', () => {
    expect(parseMembership(null)).toBeNull();
    expect(parseMembership({ role: 'admin', family_id: 'f1' })).toBeNull();
    expect(parseMembership({ role: 'parent', family_id: '' })).toBeNull();
  });
});

test('인증 오류는 한글 문구로만 보인다', () => {
  expect(signInErrorMessage({ message: 'Invalid login credentials' })).toBe('이메일이나 비밀번호가 맞지 않아요.');
  expect(signInErrorMessage(new Error('Network request failed'))).toBe('인터넷 연결을 확인한 뒤 다시 해 주세요.');
  expect(signInErrorMessage({ message: 'something else' })).toBe('로그인하지 못했어요. 잠시 뒤 다시 해 주세요.');
});

test('저장된 로그인이 없으면 로컬 모드', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null } });
  await expect(restoreAccount()).resolves.toEqual({ kind: 'local' });
  expect(mockFrom).not.toHaveBeenCalled();
});

test('로그인하면 서버에서 역할을 읽고, 인터넷이 없을 때는 마지막으로 확인한 역할을 쓴다', async () => {
  mockSignInWithPassword.mockResolvedValue({ data: { user: dad }, error: null });
  mockMaybeSingle.mockResolvedValueOnce({ data: { role: 'parent', family_id: 'f1' }, error: null });
  const signed = await signIn(' dad@example.com ', 'pw');
  expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'dad@example.com', password: 'pw' });
  expect(mockEq).toHaveBeenCalledWith('user_id', 'user-dad');
  expect(signed).toEqual({ kind: 'signedIn', email: 'dad@example.com', membership: { role: 'parent', familyId: 'f1' }, offline: false });
  expect(isParentDevice(signed)).toBe(true);

  // 앱을 다시 켰는데 인터넷이 없다
  mockGetSession.mockResolvedValue({ data: { session: { user: dad } } });
  mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
  const restored = await restoreAccount();
  expect(restored).toEqual({ kind: 'signedIn', email: 'dad@example.com', membership: { role: 'parent', familyId: 'f1' }, offline: true });
  expect(accountSummary(restored)).toContain('이 폰에 저장된 정보');
});

test('앱을 켜면 서버 확인 전에 저장된 역할로 먼저 화면을 정한다', async () => {
  memory.set('tt.account.membership', JSON.stringify({ userId: 'user-dad', role: 'parent', familyId: 'f1' }));
  mockGetSession.mockResolvedValue({ data: { session: { user: dad } } });
  let resolveQuery: (value: unknown) => void = () => undefined;
  mockMaybeSingle.mockReturnValueOnce(new Promise((resolve) => { resolveQuery = resolve; }));
  const onStored = jest.fn();
  const pending = restoreAccount(onStored);
  await new Promise((resolve) => setImmediate(resolve));
  // 서버 응답이 오기 전인데도 아빠 화면으로 정해진다
  expect(onStored).toHaveBeenCalledWith({ kind: 'signedIn', email: 'dad@example.com', membership: { role: 'parent', familyId: 'f1' }, offline: true });
  expect(isParentDevice(onStored.mock.calls[0][0])).toBe(true);
  resolveQuery({ data: { role: 'parent', family_id: 'f1' }, error: null });
  await expect(pending).resolves.toEqual({ kind: 'signedIn', email: 'dad@example.com', membership: { role: 'parent', familyId: 'f1' }, offline: false });
});

test('다른 계정의 역할 캐시는 쓰지 않는다', async () => {
  memory.set('tt.account.membership', JSON.stringify({ userId: 'someone-else', role: 'parent', familyId: 'f1' }));
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-child', email: 'kid@example.com' } } } });
  mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
  const restored = await restoreAccount();
  expect(restored).toEqual({ kind: 'signedIn', email: 'kid@example.com', membership: null, offline: true });
  expect(isParentDevice(restored)).toBe(false);
});

test('로그인 실패는 한글 오류로 던지고, 로그아웃은 이 기기만 하고 역할 캐시를 지운다', async () => {
  mockSignInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid login credentials' } });
  await expect(signIn('dad@example.com', 'wrong')).rejects.toThrow('이메일이나 비밀번호가 맞지 않아요.');

  memory.set('tt.account.membership', '{}');
  mockSignOut.mockResolvedValue({ error: null });
  await expect(signOut()).resolves.toEqual({ kind: 'local' });
  expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(memory.has('tt.account.membership')).toBe(false);
});

test('딸 계정·가족 미연결·로컬은 아이 화면, 상태 문구도 구분된다', () => {
  const child = { kind: 'signedIn', email: 'kid@example.com', membership: { role: 'child', familyId: 'f1' }, offline: false } as const;
  const unlinked = { kind: 'signedIn', email: 'new@example.com', membership: null, offline: false } as const;
  expect(isParentDevice(child)).toBe(false);
  expect(isParentDevice(unlinked)).toBe(false);
  expect(isParentDevice({ kind: 'local' })).toBe(false);
  expect(accountSummary(child)).toBe('kid@example.com · 딸 계정으로 로그인했어요.');
  expect(accountSummary(unlinked)).toContain('아직 가족에 연결되지 않았어요');
  expect(accountSummary({ kind: 'local' })).toContain('이 폰에만 저장');
});
