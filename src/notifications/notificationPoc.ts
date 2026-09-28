import { NativeModules, Platform } from 'react-native';

type NotificationPocModule = {
  schedule(delayMilliseconds: number): Promise<{ notificationId: string } | null>;
};

export type NotificationPocResult =
  | { kind: 'scheduled'; notificationId: string }
  | { kind: 'permission-denied' };

export async function scheduleNotificationPoc(delayMilliseconds = 60_000): Promise<NotificationPocResult> {
  if (Platform.OS !== 'android') throw new Error('일반 알림 PoC는 Android에서만 확인할 수 있어요.');
  const module = NativeModules.NotificationPoc as NotificationPocModule | undefined;
  if (!module) throw new Error('일반 알림 모듈이 개발 빌드에 없습니다. 새 Android 개발 빌드를 설치해 주세요.');
  const result = await module.schedule(delayMilliseconds);
  return result ? { kind: 'scheduled', notificationId: result.notificationId } : { kind: 'permission-denied' };
}
