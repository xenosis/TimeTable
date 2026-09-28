import { useEffect } from 'react';
import { AppState } from 'react-native';

import { registerRollingRefreshBackgroundTask } from './backgroundRollingRefresh';
import { refreshAllRollingOwners } from './rollingOwners';
import { initializeNotificationChannels } from './secureAlarmPoc';

export type RollingRefreshRegistration = 'registered' | 'already-registered' | 'unavailable';

export { refreshAllRollingOwners };

export function createRollingRefreshLifecycle(
  refresh: () => Promise<void>,
  register: () => Promise<RollingRefreshRegistration>,
  onUnavailable: () => void,
  initializeChannels: () => Promise<void> = async () => undefined,
) {
  const run = async () => {
    await initializeChannels();
    const [registration, refreshResult] = await Promise.allSettled([register(), refresh()]);
    if (registration.status === 'fulfilled' && registration.value === 'unavailable') onUnavailable();
    if (refreshResult.status === 'rejected') throw refreshResult.reason;
    if (registration.status === 'rejected') throw registration.reason;
  };
  return {
    run,
    onAppStateChange: (state: string) => (state === 'active' ? run() : Promise.resolve()),
  };
}

// Expo Router의 모든 진입 경로에서 마운트되어야 headless 작업과 딥링크도 같은 재예약 경계를 쓴다.
export function RollingRefreshLifecycle() {
  useEffect(() => {
    const lifecycle = createRollingRefreshLifecycle(
      refreshAllRollingOwners,
      registerRollingRefreshBackgroundTask,
      () => console.warn('TimeTable: 백그라운드 재예약을 사용할 수 없어요.'),
      initializeNotificationChannels,
    );
    void lifecycle.run().catch(() => console.warn('TimeTable: 시간표 알림을 다시 예약하지 못했어요.'));
    const subscription = AppState.addEventListener('change', (state) => {
      void lifecycle.onAppStateChange(state).catch(() => console.warn('TimeTable: 앱 복귀 후 알림을 다시 예약하지 못했어요.'));
    });
    return () => subscription.remove();
  }, []);
  return null;
}
