/**
 * 관리자 화면의 요일 선택기가 쓰는 표시 순서(월~일)와 저장값 매핑.
 * 저장값(DB·Date.getDay)은 일=0, 월=1 … 토=6이고, 화면에는 월요일부터 일요일 순서로 보여준다.
 */
export const ADMIN_WEEKDAYS = [
  { day: 1, label: '월' }, { day: 2, label: '화' }, { day: 3, label: '수' }, { day: 4, label: '목' },
  { day: 5, label: '금' }, { day: 6, label: '토' }, { day: 0, label: '일' },
] as const;

export type WeekdaySelectionMode = 'single' | 'multi';

/** 누른 요일을 반영한 새 선택값. 단일은 그 요일 하나만, 다중은 켜고 끄며 저장값(일=0) 오름차순으로 돌려준다. */
export function toggleAdminWeekday(selected: readonly number[], day: number, mode: WeekdaySelectionMode): readonly number[] {
  if (mode === 'single') return [day];
  const next = selected.includes(day) ? selected.filter((value) => value !== day) : [...selected, day];
  return [...next].sort((left, right) => left - right);
}
