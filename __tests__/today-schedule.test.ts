import { getTodaySchedule } from '../src/utils/todaySchedule';

const items = [
  { id: 1, startTime: '09:00', endTime: '09:40', title: 'Korean', category: 'school' as const, colorKey: 'korean' as const, iconKey: 'text' as const },
  { id: 2, startTime: '10:00', endTime: '10:40', title: 'Math', category: 'school' as const, colorKey: 'math' as const, iconKey: 'number' as const },
];

describe('getTodaySchedule', () => {
  it('finds the current item and the next item', () => {
    expect(getTodaySchedule(items, new Date(2026, 8, 17, 9, 20))).toMatchObject({ current: { title: 'Korean' }, next: { title: 'Math' }, minutesUntilNext: 40 });
  });

  it('shows the next item before school and no next item after the final class', () => {
    expect(getTodaySchedule(items, new Date(2026, 8, 17, 8, 50))).toMatchObject({ current: null, next: { title: 'Korean' }, minutesUntilNext: 10 });
    expect(getTodaySchedule(items, new Date(2026, 8, 17, 11, 0))).toEqual({ current: null, next: null, minutesUntilNext: null });
  });

  it('uses an inclusive start, exclusive end, and sorts input before finding the next item', () => {
    const reverseItems = [...items].reverse();
    expect(getTodaySchedule(reverseItems, new Date(2026, 8, 17, 9, 0))).toMatchObject({ current: { id: 1 }, next: { id: 2 }, minutesUntilNext: 60 });
    expect(getTodaySchedule(reverseItems, new Date(2026, 8, 17, 9, 40))).toMatchObject({ current: null, next: { id: 2 }, minutesUntilNext: 20 });
  });
});
