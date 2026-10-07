import { ACCOUNT_CACHE_KEY, DEVICE_ROLE_KEY } from '../server/accountCacheKey';
import { getAccount, isParentDevice } from '../store/accountStore';

/**
 * 아빠 계정으로 로그인한 폰은 딸의 시간표·할 일 알림·알람을 울리지 않는다(P6.8).
 * 아빠 폰도 서버 내용(딸 시간표·할 일)을 그대로 받아 두기 때문에, 막지 않으면 딸 알람이 아빠 폰에서도 울린다.
 * 로그아웃 후에도 기기 용도를 유지한다. 딸 계정으로 로그인하면 딸 알림을 다시 허용한다.
 */
export function suppressChildAlarms(): boolean {
  return confirmedChildAlarmPolicy() !== false;
}

/** 저장소 오류는 미확인으로 남겨 네이티브의 기존 차단 설정을 보존한다. */
export function confirmedChildAlarmPolicy(): boolean | null {
  const account = getAccount();
  if (account.kind === 'signedIn' && account.membership) return isParentDevice(account);
  try {
    // 알람 예약 모듈을 불러오는 모든 곳에 저장소 모듈이 딸려 가지 않도록, 계정 확인 전에만 불러온다
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Storage = (require('expo-sqlite/kv-store') as { default: { getItemSync(key: string): string | null } }).default;
    const role = Storage.getItemSync(DEVICE_ROLE_KEY);
    if (role) return role === 'parent' ? true : role === 'child' ? false : null;
    if (account.kind !== 'checking') return false;
    const cached = JSON.parse(Storage.getItemSync(ACCOUNT_CACHE_KEY) ?? 'null') as { membership?: { role?: unknown } | null } | null;
    return cached?.membership?.role === 'parent';
  } catch {
    return null;
  }
}
