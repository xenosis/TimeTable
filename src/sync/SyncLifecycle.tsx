import { useEffect } from 'react';
import { AppState } from 'react-native';

import { refreshAllRollingOwners } from '../notifications/rollingOwners';
import { syncDeviceAlarmPolicy } from '../notifications/secureAlarmPoc';
import { suppressChildAlarms } from '../notifications/parentDeviceAlarms';
import { getAccount, isParentDevice, useAccount } from '../store/accountStore';
import { runSync, syncTarget } from './syncRunner';
import { registerSyncSoonRunner } from './syncSoon';
import { runAdminEdit } from './adminEdit';
import { registerAdminEditRunner } from './adminEditGate';
import { subscribeFamilyChanges } from './realtimeSync';

/**
 * 가족에 연결된 계정이면 서버와 맞춘다: 로그인(앱 시작 때 로그인 복원 포함)으로 가족이 정해질 때 한 번, 앱으로 돌아올 때마다 한 번.
 * 로그인하지 않은 로컬 모드에서는 아무것도 하지 않는다.
 */
export function SyncLifecycle(): null {
  const account = useAccount();
  const target = syncTarget(account);
  const familyId = target?.familyId ?? null;
  const role = target?.role ?? null;
  const parentDevice = isParentDevice(account);
  // 기기 용도를 네이티브에도 저장한다. 아빠 폰은 DB 오류·로그아웃·재부팅 후에도 딸 예약을 복구하지 않는다.
  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const apply = async () => {
      try {
        await syncDeviceAlarmPolicy();
      } catch (error) {
        console.warn('TimeTable: 기기 알림 설정을 적용하지 못했어요.', error);
        if (!disposed) retry = setTimeout(() => void apply(), 5000);
        return;
      }
      if (!disposed && !suppressChildAlarms()) await refreshAllRollingOwners().catch((error) => console.warn('TimeTable: 딸 알림을 다시 예약하지 못했어요.', error));
    };
    void apply();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { clearTimeout(retry); void apply(); }
    });
    return () => { disposed = true; clearTimeout(retry); subscription.remove(); };
  }, [account.kind, parentDevice, role, familyId]);

  useEffect(() => {
    if (familyId && role) void runSync({ familyId, role });
  }, [familyId, role]);

  // 앱이 켜져 있는 동안 서버 변경을 바로 받는다(P6.7). 신호가 오면 그때의 로그인 상태로 한 번 맞춘다
  useEffect(() => {
    if (!familyId) return undefined;
    return subscribeFamilyChanges(familyId, () => {
      const current = syncTarget(getAccount());
      if (current?.familyId === familyId) void runSync(current);
    });
  }, [familyId]);

  useEffect(() => {
    // 화면에서 체크·보석 기록을 바꾸면 곧 서버와 맞추도록 실행 함수를 등록한다(로그인한 가족 계정일 때만 실제로 돈다)
    registerSyncSoonRunner(() => { const current = syncTarget(getAccount()); if (current) void runSync(current); });
    // 관리자 편집은 로그인한 폰이면 서버에 먼저 저장한다(P6.15). 로컬 모드에서는 구현이 편집을 그대로 실행한다
    registerAdminEditRunner(runAdminEdit);
    const subscription = AppState.addEventListener('change', (state) => {
      const current = syncTarget(getAccount());
      if (state === 'active' && current) void runSync(current);
    });
    return () => { subscription.remove(); registerSyncSoonRunner(null); registerAdminEditRunner(null); };
  }, []);
  return null;
}
