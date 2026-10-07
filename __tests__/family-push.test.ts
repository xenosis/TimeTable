import { NativeModules, Platform } from 'react-native';
import { setAccount, setAccountByUser } from '../src/store/accountStore';
import { registerChildPushToken, notifyParentEditSaved } from '../src/push/familyPush';
import { clearRemotePushFamily, syncRemotePushFamily } from '../src/push/pushPolicy';

const mockToken = jest.fn();
const mockPermissions = jest.fn();
const mockUser = jest.fn();
const mockRpc = jest.fn();
const mockInvoke = jest.fn();
jest.mock('../src/push/pushInstallation', () => ({ getPushInstallation: async () => ({ id: 'installation-id', secret: 'test-secret' }) }));
jest.mock('../app.json', () => ({ expo: { extra: { eas: { projectId: 'test-project' } } } }));
jest.mock('expo-notifications', () => ({ getPermissionsAsync: () => mockPermissions(), getExpoPushTokenAsync: (...args: unknown[]) => mockToken(...args) }));
jest.mock('../src/notifications/secureAlarmPoc', () => ({ initializeNotificationChannels: async () => undefined }));
jest.mock('../src/server/supabaseClient', () => ({ getSupabase: () => ({
  auth: { getUser: () => mockUser() }, functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  rpc: (...args: unknown[]) => mockRpc(...args),
}) }));

const child = () => setAccount({ kind: 'signedIn', email: 'kid@test.com', membership: { role: 'child', familyId: 'family-a' }, offline: false });
beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  NativeModules.SecureAlarmPoc = { setRemotePushFamily: jest.fn(async () => undefined) };
  mockPermissions.mockResolvedValue({ granted: true });
  mockToken.mockResolvedValue({ data: 'ExpoPushToken[token]' });
  mockUser.mockResolvedValue({ data: { user: { id: 'child-id', email: 'kid@test.com' } }, error: null });
  mockRpc.mockResolvedValue({ error: null });
  mockInvoke.mockResolvedValue({ error: null });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: jest.fn() } });
  child();
});
afterEach(() => setAccount({ kind: 'checking' }));

test('로그아웃은 서버 호출 없이 수신 가족을 지우고 확인 중에는 기존 정책을 보존한다', async () => {
  await syncRemotePushFamily();
  expect(NativeModules.SecureAlarmPoc.setRemotePushFamily).toHaveBeenCalledWith('family-a');
  await clearRemotePushFamily();
  expect(NativeModules.SecureAlarmPoc.setRemotePushFamily).toHaveBeenLastCalledWith(null);
  setAccount({ kind: 'checking' });
  await syncRemotePushFamily();
  expect(NativeModules.SecureAlarmPoc.setRemotePushFamily).toHaveBeenCalledTimes(2);
  expect(mockUser).not.toHaveBeenCalled();
});

test('딸 토큰은 현재 가족과 설치본 증명을 서버 RPC에 전달해 등록한다', async () => {
  await registerChildPushToken();
  expect(mockRpc).toHaveBeenCalledWith('tt_register_push_installation', expect.objectContaining({ p_family: 'family-a', p_installation: 'installation-id', p_secret: 'test-secret', p_token: 'ExpoPushToken[token]' }));
});

test('토큰 발급 중 계정을 바꾸면 이전 계정 토큰을 등록하지 않는다', async () => {
  mockToken.mockImplementationOnce(async () => {
    setAccountByUser({ kind: 'local' });
    return { data: 'ExpoPushToken[token]' };
  });
  await registerChildPushToken();
  expect(mockUser).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('권한 거부와 인증 사용자 불일치는 토큰을 등록하지 않는다', async () => {
  mockPermissions.mockResolvedValueOnce({ granted: false });
  await registerChildPushToken();
  expect(mockToken).not.toHaveBeenCalled();
  mockUser.mockResolvedValueOnce({ data: { user: { id: 'dad-id', email: 'dad@test.com' } }, error: null });
  await registerChildPushToken();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('인증 통신 실패는 재시도 대상으로 알리고 다음 시도에서 등록한다', async () => {
  mockUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('network') });
  await expect(registerChildPushToken()).rejects.toThrow('계정을 확인하지 못했어요');
  expect(mockRpc).not.toHaveBeenCalled();
  await registerChildPushToken();
  expect(mockRpc).toHaveBeenCalledTimes(1);
});

test('인증 확인 중 로그아웃한 이전 요청은 실패해도 재시도를 요구하지 않는다', async () => {
  mockUser.mockImplementationOnce(async () => {
    setAccountByUser({ kind: 'local' });
    return { data: { user: null }, error: new Error('network') };
  });
  await expect(registerChildPushToken()).resolves.toBeUndefined();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('아빠 계정은 딸 토큰을 등록하지 않으며 현재 가족의 저장에만 푸시를 요청한다', async () => {
  setAccount({ kind: 'signedIn', email: 'dad@test.com', membership: { role: 'parent', familyId: 'family-a' }, offline: false });
  await syncRemotePushFamily();
  expect(NativeModules.SecureAlarmPoc.setRemotePushFamily).toHaveBeenCalledWith(null);
  await registerChildPushToken();
  expect(mockToken).not.toHaveBeenCalled();
  await notifyParentEditSaved('family-b');
  expect(mockInvoke).not.toHaveBeenCalled();
  await notifyParentEditSaved('family-a');
  expect(mockInvoke).toHaveBeenCalledWith('tt-notify-change', { body: { familyId: 'family-a' } });
  mockInvoke.mockResolvedValueOnce({ error: new Error('offline') });
  await expect(notifyParentEditSaved('family-a')).rejects.toThrow('내용은 저장됐지만');
});
