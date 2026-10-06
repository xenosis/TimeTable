import { useEffect } from 'react';

import { restoreAccount, type AccountState } from './account';
import { setAccount } from '../store/accountStore';

/** 앱을 켤 때 한 번 저장된 로그인을 복원한다. 서버 확인이 실패해도 저장된 역할을 유지하고, 그것도 없으면 로컬 모드로 계속 쓴다. */
export function AccountLifecycle(): null {
  useEffect(() => {
    let cancelled = false;
    let stored: AccountState | null = null;
    restoreAccount((state) => { stored = state; if (!cancelled) setAccount(state); })
      .then((state) => { if (!cancelled) setAccount(state); })
      .catch(() => { if (!cancelled) setAccount(stored ?? { kind: 'local' }); });
    return () => { cancelled = true; };
  }, []);
  return null;
}
