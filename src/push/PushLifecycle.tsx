import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

import { useAccount } from '../store/accountStore';
import { registerChildPushToken } from './familyPush';
import { syncRemotePushFamily } from './pushPolicy';

/** 앱 복귀·로그인 전환·FCM 토큰 변경마다 현재 딸 계정의 수신 설정을 맞춘다. */
export function PushLifecycle(): null {
  const account = useAccount();
  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const apply = async () => {
      try {
        await syncRemotePushFamily();
        if (!disposed) await registerChildPushToken();
      } catch {
        console.warn('TimeTable: 변경 알림 설정을 적용하지 못했어요.');
        if (!disposed) retry = setTimeout(() => void apply(), 30_000);
      }
    };
    void apply();
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') { clearTimeout(retry); void apply(); } });
    const token = Notifications.addPushTokenListener(() => { clearTimeout(retry); void apply(); });
    return () => { disposed = true; clearTimeout(retry); appState.remove(); token.remove(); };
  }, [account]);
  return null;
}
