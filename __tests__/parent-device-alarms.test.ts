import { NativeModules, Platform } from 'react-native';

import { suppressChildAlarms } from '../src/notifications/parentDeviceAlarms';
import { replaceAndroidRollingSchedule } from '../src/notifications/secureAlarmPoc';
import { setAccount } from '../src/store/accountStore';

const mockGetItemSync = jest.fn<string | null, [string]>(() => null);
jest.mock('expo-sqlite/kv-store', () => ({ __esModule: true, default: { getItemSync: (key: string) => mockGetItemSync(key) } }));

afterEach(() => setAccount({ kind: 'checking' }));

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
  mockGetItemSync.mockReturnValueOnce(JSON.stringify({ userId: 'u', email: '', membership: { role: 'parent', familyId: 'fam-1' } }));
  expect(suppressChildAlarms()).toBe(true);
  mockGetItemSync.mockReturnValueOnce(JSON.stringify({ userId: 'u', email: '', membership: { role: 'child', familyId: 'fam-1' } }));
  expect(suppressChildAlarms()).toBe(false);
  mockGetItemSync.mockReturnValueOnce(null); // 로그아웃·로컬 모드
  expect(suppressChildAlarms()).toBe(false);
  mockGetItemSync.mockReturnValueOnce('{망가진 값');
  expect(suppressChildAlarms()).toBe(false);
  expect(mockGetItemSync).toHaveBeenCalledWith('tt.account.membership');
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
