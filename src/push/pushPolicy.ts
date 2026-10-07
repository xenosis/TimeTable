import { NativeModules, Platform } from 'react-native';
import { getAccount } from '../store/accountStore';

type PushModule = { setRemotePushFamily?: (familyId: string | null) => Promise<void> };
export const pushPolicyModule = () => NativeModules.SecureAlarmPoc as PushModule | undefined;

/** 로그아웃 전에 호출해 서버 연결 없이 이전 가족 알림 표시를 막는다. */
export async function clearRemotePushFamily(): Promise<void> {
  if (Platform.OS === 'android') await pushPolicyModule()?.setRemotePushFamily?.(null);
}

export async function syncRemotePushFamily(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const account = getAccount();
  if (account.kind === 'checking') return;
  const family = account.kind === 'signedIn' && account.membership?.role === 'child' ? account.membership.familyId : null;
  await pushPolicyModule()?.setRemotePushFamily?.(family);
}
