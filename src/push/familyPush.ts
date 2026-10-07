import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getSupabase } from '../server/supabaseClient';
import { accountUserActions, getAccount } from '../store/accountStore';
import { initializeNotificationChannels } from '../notifications/secureAlarmPoc';
import { pushPolicyModule } from './pushPolicy';
import { getPushInstallation } from './pushInstallation';

const tokenPattern = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

/** 권한과 Expo 프로젝트 설정이 갖춰진 딸 계정만 토큰을 등록한다. */
export async function registerChildPushToken(): Promise<void> {
  const account = getAccount();
  if (Platform.OS !== 'android' || account.kind !== 'signedIn' || account.membership?.role !== 'child' || !pushPolicyModule()?.setRemotePushFamily) return;
  const { familyId } = account.membership;
  const generation = accountUserActions();
  const current = () => {
    const latest = getAccount();
    return generation === accountUserActions() && latest.kind === 'signedIn' && latest.email === account.email && latest.membership?.role === 'child' && latest.membership.familyId === familyId;
  };
  const config = require('../../app.json') as { expo: { extra?: { eas?: { projectId?: string } } } };
  const projectId = config.expo.extra?.eas?.projectId;
  if (!projectId) return;
  await initializeNotificationChannels();
  if (!(await Notifications.getPermissionsAsync()).granted || !current()) return;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (!tokenPattern.test(token) || !current()) return;
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (!current()) return;
  if (error) throw new Error('변경 알림 등록을 위해 계정을 확인하지 못했어요.');
  if (!data.user || data.user.email?.toLowerCase() !== account.email.toLowerCase()) return;
  const installation = await getPushInstallation();
  if (!current()) return;
  const { error: saveError } = await supabase.rpc('tt_register_push_installation', {
    p_family: familyId, p_installation: installation.id, p_secret: installation.secret, p_token: token,
    p_version: (require('../../package.json') as { version: string }).version,
  });
  if (saveError) throw new Error('변경 알림을 받을 기기를 등록하지 못했어요.');
}

/** 편집 저장은 이미 성공했다. 푸시 접수 실패는 저장을 되돌리지 않는다. */
export async function notifyParentEditSaved(familyId: string): Promise<void> {
  const account = getAccount();
  if (account.kind !== 'signedIn' || account.membership?.role !== 'parent' || account.membership.familyId !== familyId) return;
  const { error } = await getSupabase().functions.invoke('tt-notify-change', { body: { familyId } });
  if (error) throw new Error('내용은 저장됐지만 변경 알림을 보내지 못했어요.');
}
