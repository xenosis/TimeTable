import { areRequiredAndroidPermissionsReady, shouldOpenNotificationSettings } from '../src/notifications/permissionStatus';

const ready = { notifications: true, exactAlarms: true, fullScreen: true, battery: true };

describe('required Android permission status', () => {
  it('accepts only when all four required permissions are ready', () => {
    expect(areRequiredAndroidPermissionsReady(ready)).toBe(true);
    for (const key of Object.keys(ready) as (keyof typeof ready)[]) {
      expect(areRequiredAndroidPermissionsReady({ ...ready, [key]: false })).toBe(false);
    }
  });

  it('opens app notification settings when runtime permission alone is insufficient', () => {
    expect(shouldOpenNotificationSettings(false, false)).toBe(true);
    expect(shouldOpenNotificationSettings(true, false)).toBe(true);
    expect(shouldOpenNotificationSettings(true, true)).toBe(false);
  });
});
