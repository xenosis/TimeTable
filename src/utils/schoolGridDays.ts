import type { TimetableItem } from '../db/timetableRepository';
import { formatMinutes, toMinutes, type GridDay } from './timetableGrid';

/** 오전 수업과 점심까지만 접는다. 판정은 요일 안에서 하여 주간·요일별 결과를 맞춘다. */
export function schoolGridDays(days: readonly GridDay<TimetableItem>[], expanded: boolean): readonly GridDay<TimetableItem>[] {
  if (expanded || !days.some(({ items }) => items.some((item) => item.category === 'school'))) return days;
  return days.map(({ day, items }) => {
    if (!items.some((item) => item.category === 'school')) return { day, items };
    const lunchEnds = items.filter(isLunch).map((item) => toMinutes(item.endTime)).filter(Number.isFinite);
    const cutoff = lunchEnds.length ? Math.max(...lunchEnds) : 13 * 60;
    return { day, items: items.flatMap((item) => {
      if (isLunch(item)) return [];
      if (item.category !== 'school') return [item];
      if (item.periodNo != null) return item.periodNo >= 5 ? [{ ...item, title: `${item.periodNo}교시 · ${item.title}` }] : [];
      const start = toMinutes(item.startTime);
      const end = toMinutes(item.endTime);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return [item];
      return end <= cutoff ? [] : [{ ...item, startTime: formatMinutes(Math.max(start, cutoff)) }];
    }) };
  });
}

function isLunch(item: TimetableItem): boolean {
  return item.category === 'life' && /점심|급식/.test(item.title);
}
