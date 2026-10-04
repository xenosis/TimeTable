import { ADMIN_WEEKDAYS, toggleAdminWeekday } from '../src/utils/adminWeekdays';

describe('관리자 요일 선택기 로직', () => {
  it('월요일부터 일요일 순서로 7개를 보여주고 저장값은 일=0, 월=1 … 토=6이다', () => {
    expect(ADMIN_WEEKDAYS.map(({ label }) => label).join('')).toBe('월화수목금토일');
    expect(ADMIN_WEEKDAYS.map(({ day }) => day)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(ADMIN_WEEKDAYS.find(({ label }) => label === '일')?.day).toBe(0);
  });

  it('단일 선택은 누른 요일 하나만 남기고 같은 요일을 다시 눌러도 비지 않는다', () => {
    expect(toggleAdminWeekday([1], 3, 'single')).toEqual([3]);
    expect(toggleAdminWeekday([3], 3, 'single')).toEqual([3]);
  });

  it('다중 선택은 켜고 끄며 저장값 오름차순으로 돌려준다', () => {
    expect(toggleAdminWeekday([], 0, 'multi')).toEqual([0]);
    expect(toggleAdminWeekday([3, 1], 0, 'multi')).toEqual([0, 1, 3]);
    expect(toggleAdminWeekday([0, 1, 3], 1, 'multi')).toEqual([0, 3]);
  });

  it('원래 선택 배열을 바꾸지 않는다', () => {
    const selected = [2, 1] as const;
    toggleAdminWeekday(selected, 5, 'multi');
    expect(selected).toEqual([2, 1]);
  });
});
