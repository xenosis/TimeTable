import { ACCOUNT_CACHE_KEY } from '../server/accountCacheKey';
import { getAccount, isParentDevice } from '../store/accountStore';

/**
 * 아빠 계정으로 로그인한 폰은 딸의 시간표·할 일 알림·알람을 울리지 않는다(P6.8).
 * 아빠 폰도 서버 내용(딸 시간표·할 일)을 그대로 받아 두기 때문에, 막지 않으면 딸 알람이 아빠 폰에서도 울린다.
 * 화면이 계정을 확인하기 전(앱 시작 직후·백그라운드 재예약)에는 이 기기에 마지막으로 확인해 둔 역할을 쓴다(로그아웃하면 지워진다).
 */
export function suppressChildAlarms(): boolean {
  const account = getAccount();
  if (account.kind !== 'checking') return isParentDevice(account);
  try {
    // 알람 예약 모듈을 불러오는 모든 곳에 저장소 모듈이 딸려 가지 않도록, 계정 확인 전에만 불러온다
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Storage = (require('expo-sqlite/kv-store') as { default: { getItemSync(key: string): string | null } }).default;
    const cached = JSON.parse(Storage.getItemSync(ACCOUNT_CACHE_KEY) ?? 'null') as { membership?: { role?: unknown } | null } | null;
    return cached?.membership?.role === 'parent';
  } catch {
    return false;
  }
}
