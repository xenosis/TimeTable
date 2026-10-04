import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { msUntilNextMinute } from '../utils/scheduleClock';

/**
 * 현재 로컬 시각. 매 분이 시작될 때와 앱이 다시 앞으로 올 때 갱신해, 켜 둔 화면의 "지금" 강조가 일정 시작·종료 시점에 바뀐다.
 * 화면이 사라지거나(unmount) active가 false가 되면(다른 탭으로 감) 타이머와 리스너를 모두 정리한다.
 * 다시 active가 되면 타이머를 새로 걸고, 부모가 다시 그리면서 현재 시각을 새로 읽는다.
 */
export function useNow(active = true): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return undefined;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { setNow(new Date()); timer = setTimeout(tick, msUntilNextMinute(new Date())); };
    timer = setTimeout(tick, msUntilNextMinute(new Date()));
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') setNow(new Date()); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [active]);
  return now;
}
