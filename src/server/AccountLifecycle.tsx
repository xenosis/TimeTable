import { useEffect } from 'react';

import { restoreAccount, type AccountState } from './account';
import { getSupabase } from './supabaseClient';
import { accountUserActions, getAccount, setAccount } from '../store/accountStore';

/**
 * 앱을 켤 때 한 번 저장된 로그인을 복원한다. 서버 확인이 실패해도 저장된 역할을 유지하고, 그것도 없으면 로컬 모드로 계속 쓴다.
 * 인터넷이 돌아와 토큰이 갱신되면(서버 확인 전 상태였을 때) 다시 확인하고, 다른 경로로 로그아웃되면 로컬 모드로 바꾼다.
 */
export function AccountLifecycle(): null {
  useEffect(() => {
    let cancelled = false;
    // 확인하는 사이 사용자가 직접 로그인·로그아웃했으면 늦게 온 결과는 버린다
    const restore = (useStored: boolean) => {
      const actions = accountUserActions();
      const apply = (state: AccountState) => { if (!cancelled && actions === accountUserActions()) setAccount(state); };
      let stored: AccountState | null = null;
      restoreAccount(useStored ? (state) => {
        stored = state;
        // 캐시 역할은 화면에 먼저 쓰되, 알림 경로는 서버 확인 완료까지 기다린다.
        apply(state.kind === 'signedIn' ? { ...state, restoring: true } : state);
      } : undefined)
        .then(apply)
        .catch(() => apply(stored ?? (useStored ? { kind: 'local' } : getAccount())));
    };
    restore(true);
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      const current = getAccount();
      // 콜백 안에서 바로 Supabase를 다시 부르면 인증 잠금과 겹칠 수 있어 다음 차례로 미룬다(Supabase 안내)
      if (event === 'TOKEN_REFRESHED' && current.kind === 'signedIn' && current.offline) setTimeout(() => restore(false), 0);
      if (event === 'SIGNED_OUT' && current.kind === 'signedIn') setTimeout(() => { if (!cancelled) setAccount({ kind: 'local' }); }, 0);
    });
    return () => { cancelled = true; data.subscription.unsubscribe(); };
  }, []);
  return null;
}
