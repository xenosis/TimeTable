import { makeWeeklyTimetable } from '../src/utils/weeklyTimetable';

const periods = [{ periodNo: 1, startTime: '09:00', endTime: '09:40' }, { periodNo: 2, startTime: '10:00', endTime: '10:40' }];
const math = { id: 1, periodNo: 2, startTime: '10:00', endTime: '10:40', title: '수학', colorKey: 'math' as const, iconKey: 'number' as const };

describe('makeWeeklyTimetable', () => {
  it('keeps every item in its weekday row, including same-period and time-only items', () => {
    const art = { ...math, id: 2, title: '미술', colorKey: 'art' as const, iconKey: 'art-tool' as const };
    const timeOnly = { ...math, id: 3, periodNo: null, title: '피아노', startTime: '16:00', endTime: '16:40' };
    const timetable = makeWeeklyTimetable(periods, [[], [math, art], [timeOnly]]);
    expect(timetable.periodItems[1]?.get(2)).toEqual([math, art]);
    expect(timetable.timeOnlyItems[2]).toEqual([timeOnly]);
  });
});
