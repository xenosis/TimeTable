import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

const TEST_DELAY_MS = 15_000;

type SecureAlarmModule = {
  initializeChannels(): Promise<void>;
  canUseFullScreenIntent(): Promise<boolean>;
  openFullScreenIntentSettings(): Promise<void>;
  scheduleTestAlarm(delayMilliseconds: number): Promise<{ triggerAt: number }>;
  getPermissionStatus(): Promise<{ notifications: boolean; exactAlarms: boolean; fullScreen: boolean; battery: boolean }>;
  openPermissionSettings(kind: 'notifications' | 'exactAlarms' | 'fullScreen' | 'battery'): Promise<void>;
  replaceRollingSchedule(entries: readonly { id: string; title: string; triggerAt: number; mode: 'notify' | 'alarm' }[], owner: 'timetable' | 'tasks'): Promise<number>;
};

function getModule(): SecureAlarmModule {
  const module = NativeModules.SecureAlarmPoc as SecureAlarmModule | undefined;
  if (!module) throw new Error('전용 알람 모듈이 개발 빌드에 없습니다. 새 Android 개발 빌드를 설치해 주세요.');
  return module;
}

export type AndroidPermissionStatus = Awaited<ReturnType<SecureAlarmModule['getPermissionStatus']>>;
export async function initializeNotificationChannels(): Promise<void> { requireAndroid(); await getModule().initializeChannels(); }
export async function getAndroidPermissionStatus(): Promise<AndroidPermissionStatus> { requireAndroid(); return getModule().getPermissionStatus(); }
export async function openAndroidPermissionSettings(kind: 'notifications' | 'exactAlarms' | 'fullScreen' | 'battery'): Promise<void> { requireAndroid(); await getModule().openPermissionSettings(kind); }
export async function requestAndroidNotificationPermission(): Promise<boolean> {
  requireAndroid();
  await initializeNotificationChannels();
  if (Number(Platform.Version) < 33) return (await getAndroidPermissionStatus()).notifications;
  return (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)) === PermissionsAndroid.RESULTS.GRANTED;
}
export async function replaceAndroidRollingSchedule(entries: readonly { id: string; title: string; triggerAt: number; mode: 'notify' | 'alarm' }[], owner: 'timetable' | 'tasks' = 'timetable'): Promise<number> { requireAndroid(); return getModule().replaceRollingSchedule(entries, owner); }

function requireAndroid(): void {
  if (Platform.OS !== 'android') throw new Error('잠금 화면 알람 PoC는 Android에서만 확인할 수 있어요.');
}

export async function isFullScreenAlarmAllowed(): Promise<boolean> {
  requireAndroid();
  return getModule().canUseFullScreenIntent();
}

export async function openFullScreenAlarmSettings(): Promise<void> {
  requireAndroid();
  await getModule().openFullScreenIntentSettings();
}

export async function scheduleSecureAlarmPoc(): Promise<{ seconds: number; triggerAt: number }> {
  requireAndroid();
  const { triggerAt } = await getModule().scheduleTestAlarm(TEST_DELAY_MS);
  return { seconds: TEST_DELAY_MS / 1_000, triggerAt };
}
