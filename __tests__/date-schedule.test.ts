import { holidayLine, upcomingDateForWeekday } from '../src/db/dateSchedule';
import { toLocalDateStr } from '../src/utils/date';

jest.mock('../src/db/database', () => ({ getDatabase: jest.fn() }));

// 2026-10-08은 목요일이다
const THURSDAY = new Date(2026, 9, 8, 20, 0);

test('반복 시간표의 요일은 오늘부터 7일 안의 그 날짜를 가리킨다(오늘이면 오늘)', () => {
  expect(toLocalDateStr(upcomingDateForWeekday(THURSDAY, 4))).toBe('2026-10-08');
  expect(toLocalDateStr(upcomingDateForWeekday(THURSDAY, 5))).toBe('2026-10-09');
  expect(toLocalDateStr(upcomingDateForWeekday(THURSDAY, 1))).toBe('2026-10-12');
  expect(toLocalDateStr(upcomingDateForWeekday(THURSDAY, 3))).toBe('2026-10-14');
});

test('쉬는 날 안내 문구(쉬는 날·학교만 쉬는 날)', () => {
  expect(holidayLine({ date: '2026-10-09', dayOff: { name: '한글날', kind: 'holiday' } })).toBe('10/9(금) 한글날, 쉬는 날이에요');
  expect(holidayLine({ date: '2026-10-12', dayOff: { name: '쉬는 날', kind: 'holiday' } })).toBe('10/12(월) 쉬는 날이에요');
  expect(holidayLine({ date: '2026-10-14', dayOff: { name: '재량휴업일', kind: 'school-off' } })).toBe('10/14(수) 재량휴업일, 학교 쉬는 날이에요');
});
