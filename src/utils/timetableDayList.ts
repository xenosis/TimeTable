import type { Period } from '../db/periodRepository';

type DayItem = { readonly weekday: number; readonly periodNo?: number | null; readonly startTime?: string | null; readonly endTime?: string | null; readonly id: number };

function minutesOf(clock: string | null | undefined): number | null {
  if (!clock) return null;
  const [hours, minutes] = clock.split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

/** 항목의 실제 시작·종료 시각. 교시 항목은 교시 시간표에서, 직접 입력 항목은 입력한 시각에서 가져온다. 알 수 없으면 null. */
export function itemTimes(item: DayItem, periods: readonly Period[]): { readonly start: string | null; readonly end: string | null } {
  if (item.periodNo != null) {
    const period = periods.find((value) => value.periodNo === item.periodNo);
    return { start: period?.startTime ?? null, end: period?.endTime ?? null };
  }
  return { start: item.startTime ?? null, end: item.endTime ?? null };
}

/** 선택한 하루(월~일, 일=0)의 항목만 시작 시각 순으로 돌려준다. 시각을 알 수 없는 항목은 맨 뒤에 id 순으로 둔다. */
export function itemsForDay<T extends DayItem>(items: readonly T[], weekday: number, periods: readonly Period[]): readonly T[] {
  return items
    .filter((item) => item.weekday === weekday)
    .map((item) => ({ item, start: minutesOf(itemTimes(item, periods).start) }))
    .sort((left, right) => (left.start ?? Number.MAX_SAFE_INTEGER) - (right.start ?? Number.MAX_SAFE_INTEGER) || left.item.id - right.item.id)
    .map(({ item }) => item);
}
