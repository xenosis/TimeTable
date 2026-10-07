import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

import { confirmedChildAlarmPolicy } from './parentDeviceAlarms';

const TEST_DELAY_MS = 15_000;

type SecureAlarmModule = {
  setChildAlarmsSuppressed(suppressed: boolean): Promise<void>;
  initializeChannels(): Promise<void>;
  canUseFullScreenIntent(): Promise<boolean>;
  openFullScreenIntentSettings(): Promise<void>;
  scheduleTestAlarm(delayMilliseconds: number): Promise<{ triggerAt: number }>;
  getPermissionStatus(): Promise<{ notifications: boolean; exactAlarms: boolean; fullScreen: boolean; battery: boolean }>;
  openPermissionSettings(kind: 'notifications' | 'exactAlarms' | 'fullScreen' | 'battery'): Promise<void>;
  replaceRollingSchedule(entries: readonly { id: string; title: string; memo?: string; triggerAt: number; mode: 'notify' | 'alarm' }[], owner: 'timetable' | 'tasks'): Promise<number>;
};

function getModule(): SecureAlarmModule {
  const module = NativeModules.SecureAlarmPoc as SecureAlarmModule | undefined;
  if (!module) throw new Error('전용 알람 모듈이 개발 빌드에 없습니다. 새 Android 개발 빌드를 설치해 주세요.');
  return module;
}

export type AndroidPermissionStatus = Awaited<ReturnType<SecureAlarmModule['getPermissionStatus']>>;
/** DB 조회 없이 기기 용도를 네이티브에 저장하고 아빠 폰의 기존 예약을 제거한다. */
export async function syncDeviceAlarmPolicy(): Promise<void> {
  requireAndroid();
  const policy = confirmedChildAlarmPolicy();
  if (policy === null) throw new Error('기기 역할을 확인하지 못했어요. 기존 알람 설정을 유지해요.');
  await getModule().setChildAlarmsSuppressed(policy);
}
export async function initializeNotificationChannels(): Promise<void> { requireAndroid(); await getModule().initializeChannels(); }
export async function getAndroidPermissionStatus(): Promise<AndroidPermissionStatus> { requireAndroid(); return getModule().getPermissionStatus(); }
export async function openAndroidPermissionSettings(kind: 'notifications' | 'exactAlarms' | 'fullScreen' | 'battery'): Promise<void> { requireAndroid(); await getModule().openPermissionSettings(kind); }
export async function requestAndroidNotificationPermission(): Promise<boolean> {
  requireAndroid();
  await initializeNotificationChannels();
  if (Number(Platform.Version) < 33) return (await getAndroidPermissionStatus()).notifications;
  return (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)) === PermissionsAndroid.RESULTS.GRANTED;
}
/** 아빠 폰이면 예약할 목록을 비워 이미 걸린 딸 알림·알람도 함께 지운다(P6.8, parentDeviceAlarms.ts). */
export async function replaceAndroidRollingSchedule(entries: readonly { id: string; title: string; memo?: string; triggerAt: number; mode: 'notify' | 'alarm' }[], owner: 'timetable' | 'tasks' = 'timetable'): Promise<number> {
  requireAndroid();
  const policy = confirmedChildAlarmPolicy();
  if (policy === null) throw new Error('기기 역할을 확인하지 못했어요. 기존 알람 예약을 유지해요.');
  return getModule().replaceRollingSchedule(policy ? [] : entries, owner);
}

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
