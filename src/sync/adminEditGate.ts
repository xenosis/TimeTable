/**
 * 화면 코드가 부르는 관리자 편집 입구(P6.15). 로그인한 폰이면 SyncLifecycle이 등록한 '서버에 먼저 저장' 구현(adminEdit.ts)을 쓰고,
 * 등록 전이면(로그인하지 않은 로컬 모드, 테스트 등) 편집을 그대로 실행한다. 화면이 동기화 모듈(네이티브 DB·서버)을 직접 불러오지 않게 한다.
 */
type Runner = <T>(action: () => Promise<T>) => Promise<T>;
let runner: Runner | null = null;

export function registerAdminEditRunner(next: Runner | null): void {
  runner = next;
}

export function runAdminEdit<T>(action: () => Promise<T>): Promise<T> {
  return runner ? runner(action) : action();
}
