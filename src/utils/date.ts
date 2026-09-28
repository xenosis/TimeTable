// 로컬 타임존 기준 날짜 유틸 (Doro src/utils/date.ts와 동일한 패턴)
// new Date().toISOString()은 UTC 기준이라 한국 시간 자정 근처에서 날짜가 하루 밀릴 수 있어
// 반드시 로컬 시각 기준으로 YYYY-MM-DD 문자열을 만든다.

export function toLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 요일 인덱스 (0=일 ~ 6=토)를 한글 요일로 변환
const WEEKDAY_LABELS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS_KO[weekday];
}

/** Milliseconds from `now` until the next local midnight (always > 0, even if `now` is exactly midnight). */
export function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
}
