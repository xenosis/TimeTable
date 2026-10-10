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
    let running = false;
    let rerun = false;
    let lastToken: string | undefined;
    const apply = async () => {
      if (disposed) return;
      if (running) { rerun = true; return; }
      running = true;
      try {
        await syncRemotePushFamily();
        if (!disposed) await registerChildPushToken();
      } catch {
        console.warn('TimeTable: 변경 알림 설정을 적용하지 못했어요.');
        if (!disposed) retry = setTimeout(() => void apply(), 30_000);
      } finally {
        running = false;
        if (rerun && !disposed) {
          rerun = false;
          clearTimeout(retry);
          void apply();
        }
      }
    };
    void apply();
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') { clearTimeout(retry); void apply(); } });
    const token = Notifications.addPushTokenListener((value) => {
      // Android는 토큰 조회 때도 이벤트를 보낸다. 같은 토큰으로 등록을 재귀 실행하지 않는다.
      if (typeof value.data !== 'string' || value.data === lastToken) return;
      lastToken = value.data;
      clearTimeout(retry);
      void apply();
    });
    return () => { disposed = true; clearTimeout(retry); appState.remove(); token.remove(); };
  }, [account]);
  return null;
}
