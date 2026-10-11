import { NativeModules, Platform } from 'react-native';
import { setAccountByUser } from '../src/store/accountStore';
import { registerChildPushToken } from '../src/push/familyPush';
import { runSync } from '../src/sync/syncRunner';

const mockRpc = jest.fn();
jest.mock('../src/server/supabaseClient', () => ({ getSupabase: () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'child', email: 'kid@test.com' } }, error: null }) },
  rpc: (...args: unknown[]) => mockRpc(...args),
}) }));
jest.mock('../src/push/pushInstallation', () => ({ getPushInstallation: async () => ({ id: 'installation', secret: 'proof' }) }));
jest.mock('../app.json', () => ({ expo: { extra: { eas: { projectId: 'project' } } } }));
jest.mock('expo-notifications', () => ({ getPermissionsAsync: async () => ({ granted: true }), getExpoPushTokenAsync: async () => ({ data: 'ExpoPushToken[token]' }) }));
jest.mock('../src/notifications/secureAlarmPoc', () => ({ initializeNotificationChannels: async () => undefined }));
jest.mock('../src/db/database', () => ({ getDatabase: async () => ({}) }));
jest.mock('../src/server/localImport', () => ({ hasLocalData: async () => false }));
jest.mock('../src/sync/pullSnapshot', () => ({
  fetchLocalSnapshot: async () => ({ timetable_sets: [{ id: 1 }] }),
  replaceLocalWithSnapshot: async () => undefined,
  serverHasFamilyData: async () => true,
}));
jest.mock('../src/sync/pushChildRecords', () => ({ pushChildRecords: async () => 0 }));
jest.mock('../src/widgets/widgetRefresh', () => ({ applyPendingWidgetChecksNow: async () => 0, requestWidgetRefresh: async () => undefined }));
jest.mock('../src/widgets/widgetChecksSignal', () => ({ notifyWidgetChecksApplied: () => undefined }));
jest.mock('../src/notifications/rollingOwners', () => ({ refreshAllRollingOwners: async () => undefined }));
jest.mock('../src/sync/syncSoon', () => ({ requestSyncSoon: () => undefined }));
jest.mock('../src/sync/syncStatus', () => ({ setSyncStatus: () => undefined }));

function account(familyId: string) {
  setAccountByUser({ kind: 'signedIn', email: 'kid@test.com', offline: false, membership: { role: 'child', familyId } });
}
const operations = {
  token: () => registerChildPushToken(),
  sync: (familyId: string) => runSync({ familyId, role: 'child' }),
};
const rpcNames = { token: 'tt_register_push_installation', sync: 'tt_record_device_sync' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  NativeModules.SecureAlarmPoc = { setRemotePushFamily: jest.fn() };
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  mockRpc.mockResolvedValue({ error: null });
  account('family-a');
});

test.each([['sync', 'token'], ['token', 'sync']] as const)('%s 이후 새 계정 %s 기록은 이전 응답을 기다린다', async (first, second) => {
  let finish!: () => void;
  const response = new Promise<void>((resolve) => { finish = resolve; });
  mockRpc.mockImplementationOnce(async () => { await response; return { error: null }; });
  const previous = operations[first]('family-a');
  await new Promise((resolve) => setImmediate(resolve));
  expect(mockRpc).toHaveBeenCalledTimes(1);
  account('family-b');
  const latest = operations[second]('family-b');
  await new Promise((resolve) => setImmediate(resolve));
  expect(mockRpc).toHaveBeenCalledTimes(1);
  finish();
  await Promise.all([previous, latest]);
  expect(mockRpc.mock.calls.map(([name, body]) => [name, body.p_family])).toEqual([
    [rpcNames[first], 'family-a'], [rpcNames[second], 'family-b'],
  ]);
});

test('공용 큐에서 기다리던 토큰 등록도 로그아웃하면 서버에 쓰지 않는다', async () => {
  let finish!: () => void;
  mockRpc.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve({ error: null }); }));
  const previous = runSync({ familyId: 'family-a', role: 'child' });
  await new Promise((resolve) => setImmediate(resolve));
  const queued = registerChildPushToken();
  await new Promise((resolve) => setImmediate(resolve));
  setAccountByUser({ kind: 'local' });
  finish();
  await Promise.all([previous, queued]);
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(mockRpc.mock.calls[0][0]).toBe('tt_record_device_sync');
});
