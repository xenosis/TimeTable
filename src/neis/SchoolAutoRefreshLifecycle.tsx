import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAccount } from '../store/accountStore';
import { refreshSchoolTimetableIfDue } from './schoolAutoRefresh';

/**
 * 학교 시간표 자동 갱신(P8.7)을 앱이 켜질 때·로그인 상태가 정해질 때·앱으로 돌아올 때 확인한다.
 * 실제로 묻는 간격·대상 기기 판단은 refreshSchoolTimetableIfDue가 한다.
 */
export function SchoolAutoRefreshLifecycle(): null {
  const account = useAccount();
  const ready = account.kind !== 'checking';
  const role = account.kind === 'signedIn' ? account.membership?.role ?? 'none' : account.kind;

  useEffect(() => {
    if (!ready) return undefined;
    // 로그인 직후에는 첫 동기화와 겹치지 않게 조금 뒤에 확인한다(편집·동기화는 같은 줄에서 차례로 돈다)
    const timer = setTimeout(() => { void refreshSchoolTimetableIfDue(); }, 5000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refreshSchoolTimetableIfDue(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [ready, role]);
  return null;
}
