import { NativeModules, Platform } from 'react-native';

import { suppressChildAlarms } from '../src/notifications/parentDeviceAlarms';
import { replaceAndroidRollingSchedule, syncDeviceAlarmPolicy } from '../src/notifications/secureAlarmPoc';
import { setAccount } from '../src/store/accountStore';

const mockGetItemSync = jest.fn<string | null, [string]>(() => null);
jest.mock('expo-sqlite/kv-store', () => ({ __esModule: true, default: { getItemSync: (key: string) => mockGetItemSync(key) } }));

afterEach(() => setAccount({ kind: 'checking' }));
beforeEach(() => mockGetItemSync.mockReset().mockReturnValue(null));

const signedIn = (role: 'parent' | 'child') => ({ kind: 'signedIn' as const, email: 'a@b.c', membership: { role, familyId: 'fam-1' }, offline: false });

test('아빠 계정으로 로그인한 폰만 딸 알림·알람을 막는다', () => {
  setAccount(signedIn('parent'));
  expect(suppressChildAlarms()).toBe(true);
  setAccount(signedIn('child'));
  expect(suppressChildAlarms()).toBe(false);
  setAccount({ kind: 'local' });
  expect(suppressChildAlarms()).toBe(false);
});

test('계정 확인 전(앱 시작 직후·백그라운드)에는 마지막으로 확인해 둔 역할을 쓴다', () => {
  setAccount({ kind: 'checking' });
  mockGetItemSync.mockReturnValueOnce(null).mockReturnValueOnce(JSON.stringify({ userId: 'u', email: '', membership: { role: 'parent', familyId: 'fam-1' } }));
  expect(suppressChildAlarms()).toBe(true);
  mockGetItemSync.mockReturnValueOnce(null).mockReturnValueOnce(JSON.stringify({ userId: 'u', email: '', membership: { role: 'child', familyId: 'fam-1' } }));
  expect(suppressChildAlarms()).toBe(false);
  mockGetItemSync.mockReturnValueOnce(null); // 로그아웃·로컬 모드
  expect(suppressChildAlarms()).toBe(false);
  mockGetItemSync.mockReturnValueOnce(null).mockReturnValueOnce('{망가진 값');
  expect(suppressChildAlarms()).toBe(true);
  expect(mockGetItemSync).toHaveBeenCalledWith('tt.account.membership');
});

test('역할 저장소 오류는 네이티브 차단 설정을 덮어쓰지 않는다', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  setAccount({ kind: 'checking' });
  mockGetItemSync.mockImplementation(() => { throw new Error('storage failed'); });
  const setChildAlarmsSuppressed = jest.fn();
  NativeModules.SecureAlarmPoc = { setChildAlarmsSuppressed };
  await expect(syncDeviceAlarmPolicy()).rejects.toThrow('기존 알람 설정');
  expect(setChildAlarmsSuppressed).not.toHaveBeenCalled();
  expect(suppressChildAlarms()).toBe(true);
});

test('역할 조회 실패 시 두 종류의 기존 예약을 빈 목록으로 교체하지 않는다', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  setAccount({ kind: 'checking' });
  mockGetItemSync.mockImplementation(() => { throw new Error('storage failed'); });
  const replaceRollingSchedule = jest.fn();
  NativeModules.SecureAlarmPoc = { replaceRollingSchedule };
  for (const owner of ['timetable', 'tasks'] as const) {
    await expect(replaceAndroidRollingSchedule([], owner)).rejects.toThrow('기존 알람 예약');
  }
  expect(replaceRollingSchedule).not.toHaveBeenCalled();
});

test('아빠 폰은 로그아웃 후에도 차단하고 딸 계정으로 로그인하면 허용한다', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  mockGetItemSync.mockImplementation((key) => key === 'tt.device.role' ? 'parent' : null);
  setAccount({ kind: 'local' });
  expect(suppressChildAlarms()).toBe(true);
  const setChildAlarmsSuppressed = jest.fn(async () => undefined);
  NativeModules.SecureAlarmPoc = { setChildAlarmsSuppressed };
  await syncDeviceAlarmPolicy();
  expect(setChildAlarmsSuppressed).toHaveBeenCalledWith(true);
  setAccount(signedIn('child'));
  expect(suppressChildAlarms()).toBe(false);
});

test('아빠 폰이면 네이티브 예약에 빈 목록을 넘겨 이미 걸린 딸 알람도 지우고, 딸 폰은 그대로 넘긴다', async () => {
  const replaceRollingSchedule = jest.fn(async () => 0);
  NativeModules.SecureAlarmPoc = { replaceRollingSchedule };
  jest.replaceProperty(Platform, 'OS', 'android');
  const entries = [{ id: 't1', title: '피아노', triggerAt: 1, mode: 'alarm' as const }];
  setAccount(signedIn('parent'));
  await replaceAndroidRollingSchedule(entries, 'tasks');
  expect(replaceRollingSchedule).toHaveBeenLastCalledWith([], 'tasks');
  setAccount(signedIn('child'));
  await replaceAndroidRollingSchedule(entries, 'tasks');
  expect(replaceRollingSchedule).toHaveBeenLastCalledWith(entries, 'tasks');
});
