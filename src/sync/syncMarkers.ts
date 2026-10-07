/**
 * 동기화 표시(이 폰이 어느 가족과 서버 기준으로 맞췄는지, 마지막으로 맞춘 시각). 화면·로그인 코드도 부담 없이 쓰도록 가벼운 모듈로 둔다.
 * 표시가 없으면 다음 동기화는 '서버 기준 첫 동기화'다(폰의 가족 데이터를 서버 내용으로 통째로 바꾼다).
 */
const SYNCED_FAMILY_KEY = 'tt.sync.family';
const LAST_SYNC_KEY = 'tt.sync.last';

function read(key: string): string | null {
  try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
}

export function hasSyncedFamily(familyId: string): boolean {
  return read(SYNCED_FAMILY_KEY) === familyId;
}

export function lastSyncedAt(): string | null {
  return read(LAST_SYNC_KEY);
}

export function markSynced(familyId: string, at: string): void {
  globalThis.localStorage?.setItem(SYNCED_FAMILY_KEY, familyId);
  globalThis.localStorage?.setItem(LAST_SYNC_KEY, at);
}

/** 로그아웃하거나 '서버 내용으로 다시 맞추기'를 고르면 지운다. 다음 동기화가 서버 기준으로 처음부터 맞춘다. */
export function clearSyncedFamily(): void {
  try { globalThis.localStorage?.removeItem(SYNCED_FAMILY_KEY); } catch { /* 저장소를 못 써도 로그아웃은 계속한다 */ }
}
