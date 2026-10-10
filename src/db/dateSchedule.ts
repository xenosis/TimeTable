import { toLocalDateStr } from '../utils/date';
import { getHolidayName } from './dayExceptionRepository';
import { getTimetableItemsForWeekday, type TimetableItem } from './timetableRepository';
import type { TimetableDatabase, TimetableSetId } from './types';

/** 한 날짜의 일정. 쉬는 날(휴일)이면 items는 비어 있고 holiday에 이름이 있다(P8.8: 공휴일에는 학교·학원 모두 안 간다). */
export type DateSchedule = { readonly date: string; readonly holiday: string | null; readonly items: readonly TimetableItem[] };

/** 매주 반복 시간표의 한 요일이 가리키는 날짜: 오늘부터 7일 안에서 그 요일(오늘이 그 요일이면 오늘). */
export function upcomingDateForWeekday(today: Date, weekday: number): Date {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + ((weekday - today.getDay() + 7) % 7));
}

export async function getScheduleForDate(database: Pick<TimetableDatabase, 'getAllAsync' | 'getFirstAsync'>, date: Date, setId: TimetableSetId): Promise<DateSchedule> {
  const key = toLocalDateStr(date);
  const holiday = await getHolidayName(database, key);
  return { date: key, holiday, items: holiday ? [] : await getTimetableItemsForWeekday(database, date.getDay(), setId) };
}

/** 쉬는 날 안내 한 줄(예: '10/12(월) 한글날 — 쉬는 날이에요'). */
export function holidayLine(schedule: Pick<DateSchedule, 'date' | 'holiday'>): string {
  const [, month, day] = schedule.date.split('-').map(Number);
  const weekday = '일월화수목금토'[new Date(Number(schedule.date.slice(0, 4)), month - 1, day).getDay()];
  return `${month}/${day}(${weekday}) ${schedule.holiday === '쉬는 날' ? '' : `${schedule.holiday} — `}쉬는 날이에요`;
}
