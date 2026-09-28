import type { TimetableItem } from '../db/timetableRepository';
import type { Period } from '../db/periodRepository';

export type WeeklyTimetableData = {
  readonly periodItems: Readonly<Record<number, ReadonlyMap<number, readonly TimetableItem[]>>>;
  readonly timeOnlyItems: Readonly<Record<number, readonly TimetableItem[]>>;
};

export function makeWeeklyTimetable(periods: readonly Period[], itemsByWeekday: readonly (readonly TimetableItem[])[]): WeeklyTimetableData {
  const knownPeriods = new Set(periods.map((period) => period.periodNo));
  const periodItems: Record<number, ReadonlyMap<number, readonly TimetableItem[]>> = {};
  const timeOnlyItems: Record<number, readonly TimetableItem[]> = {};
  itemsByWeekday.forEach((items, weekday) => {
    const grouped = new Map<number, TimetableItem[]>();
    const timeOnly: TimetableItem[] = [];
    items.forEach((item) => {
      if (item.periodNo != null && knownPeriods.has(item.periodNo)) grouped.set(item.periodNo, [...(grouped.get(item.periodNo) ?? []), item]);
      else timeOnly.push(item);
    });
    periodItems[weekday] = grouped;
    timeOnlyItems[weekday] = timeOnly;
  });
  return { periodItems, timeOnlyItems };
}
