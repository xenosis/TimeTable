import { toLocalDateStr } from '../utils/date';
import { getDayOff, type DayOff } from './dayExceptionRepository';
import { getTimetableItemsForWeekday, type TimetableItem } from './timetableRepository';
import type { TimetableDatabase, TimetableSetId } from './types';

/**
 * 한 날짜의 일정(P8.8). 쉬는 날(공휴일)이면 학교·학원 모두 안 가므로 items가 비어 있고,
 * 학교만 쉬는 날(재량휴업일 등)이면 학교 일정만 빠진다. dayOff에 그날 이름·종류가 있다.
 */
export type DateSchedule = { readonly date: string; readonly dayOff: DayOff | null; readonly items: readonly TimetableItem[] };

/** 매주 반복 시간표의 한 요일이 가리키는 날짜: 오늘부터 7일 안에서 그 요일(오늘이 그 요일이면 오늘). */
export function upcomingDateForWeekday(today: Date, weekday: number): Date {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + ((weekday - today.getDay() + 7) % 7));
}

export async function getScheduleForDate(database: Pick<TimetableDatabase, 'getAllAsync' | 'getFirstAsync'>, date: Date, setId: TimetableSetId): Promise<DateSchedule> {
  const key = toLocalDateStr(date);
  const dayOff = await getDayOff(database, key);
  if (dayOff?.kind === 'holiday') return { date: key, dayOff, items: [] };
  const items = await getTimetableItemsForWeekday(database, date.getDay(), setId);
  return { date: key, dayOff, items: dayOff ? items.filter((item) => item.category !== 'school') : items };
}

/** 쉬는 날 이름 문구: '한글날, 쉬는 날' / '재량휴업일, 학교 쉬는 날' (이름이 따로 없으면 종류만). */
export function dayOffText(dayOff: DayOff): string {
  const kind = dayOff.kind === 'holiday' ? '쉬는 날' : '학교 쉬는 날';
  return dayOff.name === '쉬는 날' ? kind : `${dayOff.name}, ${kind}`;
}

/** 쉬는 날 안내 한 줄(예: '10/9(금) 한글날, 쉬는 날이에요'). */
export function holidayLine(schedule: Pick<DateSchedule, 'date'> & { readonly dayOff: DayOff }): string {
  const [year, month, day] = schedule.date.split('-').map(Number);
  const weekday = '일월화수목금토'[new Date(year, month - 1, day).getDay()];
  return `${month}/${day}(${weekday}) ${dayOffText(schedule.dayOff)}이에요`;
}
