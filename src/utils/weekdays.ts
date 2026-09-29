/** 학교·학원 일정 확인이 핵심 목적이라 시간표는 월~금만 보여준다. */
export const SCHOOL_WEEKDAYS = [
  { day: 1, label: '월' },
  { day: 2, label: '화' },
  { day: 3, label: '수' },
  { day: 4, label: '목' },
  { day: 5, label: '금' },
] as const;

/** 오늘이 주말이면(토·일) 다음 등원일인 월요일을 기본 선택 요일로 삼는다. */
export function defaultSchoolWeekday(today: number): number {
  return today >= 1 && today <= 5 ? today : 1;
}
