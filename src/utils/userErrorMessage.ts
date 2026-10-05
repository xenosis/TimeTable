/**
 * 화면에 보여 줄 오류 문구. 저장소가 한글로 알려 주는 검증 오류(이름 중복, 요일 미선택 등)는 그대로 쓰고,
 * SQLite·네이티브 오류처럼 영어로 된 내부 메시지는 아이·부모에게 보이지 않게 일반 문구로 바꾼다.
 */
export function userErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && /[가-힣]/.test(error.message) ? error.message : fallback;
}
