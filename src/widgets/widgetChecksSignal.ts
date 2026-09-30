type Listener = () => void;

const listeners = new Set<Listener>();

/** 위젯에서 누른 체크가 DB에 반영됐을 때 불리는 구독. 화면이 오늘 할 일·보석을 다시 읽는 데 쓴다. 구독 해제 함수를 돌려준다. */
export function subscribeWidgetChecksApplied(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function notifyWidgetChecksApplied(): void {
  for (const listener of [...listeners]) {
    try { listener(); } catch (error) { console.warn('TimeTable: 위젯 체크 반영 알림을 처리하지 못했어요.', error); }
  }
}
