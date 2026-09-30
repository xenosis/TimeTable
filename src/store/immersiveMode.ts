import { useSyncExternalStore } from 'react';

/** 가로 주간 시간표처럼 화면을 최대한 넓게 써야 할 때 앱 헤더·하단 탭을 숨기기 위한 공유 상태. */
let immersive = false;
const listeners = new Set<() => void>();

export function setImmersive(value: boolean): void {
  if (immersive === value) return;
  immersive = value;
  listeners.forEach((listener) => listener());
}

export function useImmersive(): boolean {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => immersive,
    () => false,
  );
}
