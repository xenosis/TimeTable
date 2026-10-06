import { useEffect } from 'react';
import { AppState } from 'react-native';

import { getAccount, useAccount } from '../store/accountStore';
import { runSync, syncTarget } from './syncRunner';

/**
 * 가족에 연결된 계정이면 서버와 맞춘다: 로그인(앱 시작 때 로그인 복원 포함)으로 가족이 정해질 때 한 번, 앱으로 돌아올 때마다 한 번.
 * 로그인하지 않은 로컬 모드에서는 아무것도 하지 않는다.
 */
export function SyncLifecycle(): null {
  const account = useAccount();
  const target = syncTarget(account);
  const familyId = target?.familyId ?? null;
  const role = target?.role ?? null;

  useEffect(() => {
    if (familyId && role) void runSync({ familyId, role });
  }, [familyId, role]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const current = syncTarget(getAccount());
      if (state === 'active' && current) void runSync(current);
    });
    return () => subscription.remove();
  }, []);
  return null;
}
