/**
 * 딸 폰이 주인인 기록(체크·완료 이력·보석 장부·보석 자격)이 바뀔 때마다 늘어나는 횟수(이 앱 실행 안에서만).
 * 동기화(P6.14)가 올린 뒤 받아올 때, 그 사이 폰에서 새 체크가 생겼으면 서버 내용으로 덮지 않고 다음에 올리게 하는 데 쓴다.
 */
let version = 0;

export function bumpChildChangeVersion(): void {
  version += 1;
}

export function childChangeVersion(): number {
  return version;
}
