import { itemTimes, itemsForDay } from '../src/utils/timetableDayList';

const periods = [
  { periodNo: 1, startTime: '09:00', endTime: '09:40' },
  { periodNo: 2, startTime: '09:50', endTime: '10:30' },
];
const item = (id: number, weekday: number, extra: { periodNo?: number | null; startTime?: string | null; endTime?: string | null } = {}) => ({ id, weekday, ...extra });

describe('요일별 항목 목록', () => {
  it('선택한 하루의 항목만 보여준다(평일 4개씩 20개 중 하루 4개)', () => {
    const items = [1, 2, 3, 4, 5].flatMap((day) => [1, 2, 3, 4].map((n) => item(day * 10 + n, day, { startTime: `1${n}:00`, endTime: `1${n}:30` })));
    expect(items).toHaveLength(20);
    expect(itemsForDay(items, 3, periods).map(({ id }) => id)).toEqual([31, 32, 33, 34]);
  });

  it('교시 항목과 직접 입력 항목을 실제 시작 시각 순으로 섞어 정렬한다', () => {
    const items = [item(1, 2, { startTime: '14:00', endTime: '15:00' }), item(2, 2, { periodNo: 2 }), item(3, 2, { periodNo: 1 }), item(4, 2, { startTime: '09:45', endTime: '09:49' })];
    expect(itemsForDay(items, 2, periods).map(({ id }) => id)).toEqual([3, 4, 2, 1]);
  });

  it('시각을 알 수 없는 항목은 맨 뒤에 둔다', () => {
    const items = [item(1, 0, { periodNo: 9 }), item(2, 0, { startTime: '10:00', endTime: '11:00' })];
    expect(itemsForDay(items, 0, periods).map(({ id }) => id)).toEqual([2, 1]);
  });

  it('토·일이나 항목이 없는 요일은 빈 목록이다', () => {
    expect(itemsForDay([item(1, 1, { startTime: '09:00', endTime: '10:00' })], 6, periods)).toEqual([]);
    expect(itemsForDay([], 0, periods)).toEqual([]);
  });

  it('교시 항목의 시각은 교시 시간표에서 가져온다', () => {
    expect(itemTimes(item(1, 1, { periodNo: 2 }), periods)).toEqual({ start: '09:50', end: '10:30' });
    expect(itemTimes(item(1, 1, { startTime: '16:00', endTime: '17:00' }), periods)).toEqual({ start: '16:00', end: '17:00' });
  });
});
