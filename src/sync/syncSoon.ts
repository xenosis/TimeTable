/**
 * 앱 안에서 체크·보석 기록을 바꾼 뒤 부르는 '곧 서버와 맞추기' 요청(P6.14). 화면 코드가 동기화 모듈(네이티브 DB·알림)을 직접
 * 불러오지 않도록, 실제 실행 함수는 SyncLifecycle이 등록한다. 등록 전(로그인하지 않은 로컬 모드 등)에는 아무것도 하지 않는다.
 * 연달아 눌러도 마지막 변경 3초 뒤 한 번만 실행한다.
 */
let runner: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function registerSyncSoonRunner(next: (() => void) | null): void {
  runner = next;
}

export function requestSyncSoon(delayMs = 3000): void {
  if (!runner) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    runner?.();
  }, delayMs);
}
