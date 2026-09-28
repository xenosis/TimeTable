import type { AndroidPermissionStatus } from './secureAlarmPoc';

export const requiredAndroidPermissionKeys = ['notifications', 'exactAlarms', 'fullScreen', 'battery'] as const;

export function areRequiredAndroidPermissionsReady(status: AndroidPermissionStatus): boolean {
  return requiredAndroidPermissionKeys.every((key) => status[key]);
}

export function shouldOpenNotificationSettings(runtimePermissionGranted: boolean, notificationsEnabled: boolean): boolean {
  return !runtimePermissionGranted || !notificationsEnabled;
}
