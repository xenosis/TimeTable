import { useEffect } from 'react';

import { restoreAccount } from './account';
import { setAccount } from '../store/accountStore';

/** 앱을 켤 때 한 번 저장된 로그인을 복원한다. 실패해도(저장소 오류 등) 로컬 모드로 계속 쓴다. */
export function AccountLifecycle(): null {
  useEffect(() => {
    let cancelled = false;
    restoreAccount()
      .then((state) => { if (!cancelled) setAccount(state); })
      .catch(() => { if (!cancelled) setAccount({ kind: 'local' }); });
    return () => { cancelled = true; };
  }, []);
  return null;
}
