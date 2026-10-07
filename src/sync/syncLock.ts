/**
 * 동기화(받아오기·올리기)와 로그인 상태 관리자 편집(서버에 먼저 저장)이 서로 겹치지 않게 하는 한 줄(P6.15 리뷰 H3).
 * 겹치면 편집 전후 비교가 동기화 교체에 섞이거나, 편집 전에 받아 둔 서버 내용이 편집을 덮을 수 있다.
 * 체크 기록 줄(rewardQueue)과는 별개다: 편집 함수 안에서 그 줄을 쓰므로 같은 줄로 합치면 서로 기다리다 멈춘다.
 */
let tail: Promise<unknown> = Promise.resolve();

export function withSyncLock<T>(action: () => Promise<T>): Promise<T> {
  const run = tail.then(action);
  tail = run.catch(() => undefined);
  return run;
}
