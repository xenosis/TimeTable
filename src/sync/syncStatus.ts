import { useSyncExternalStore } from 'react';

/** 동기화 진행 상태(관리자 '서버 연결'에 보여 준다). 서버 호출은 syncRunner가 맡는다. */
export type SyncStatus =
  | { readonly state: 'idle'; readonly lastSyncedAt?: string | null }
  | { readonly state: 'syncing' }
  | { readonly state: 'error'; readonly lastSyncedAt?: string | null; readonly message: string };

export type FamilySyncStatus = SyncStatus & { readonly familyId?: string };

let status: FamilySyncStatus = { state: 'idle' };
const listeners = new Set<() => void>();

export function setSyncStatus(next: FamilySyncStatus): void {
  status = next;
  listeners.forEach((listener) => listener());
}

export function useSyncStatus(): FamilySyncStatus {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => status,
    () => status,
  );
}

/** 마지막 동기화 시각을 '10월 6일 23:10'처럼 보여 준다. */
export function formatSyncTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '아직 없음';
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return '아직 없음';
  const hm = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
  const sameDay = time.toDateString() === now.toDateString();
  return sameDay ? `오늘 ${hm}` : `${time.getMonth() + 1}월 ${time.getDate()}일 ${hm}`;
}
