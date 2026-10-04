import { clockToMinutes, formatNow, lightenColor, minutesOfDay, msUntilNextMinute, scheduleStatus } from '../src/utils/scheduleClock';

const at = (clock: string) => clockToMinutes(clock)!;

describe('scheduleStatus (시작 <= 현재 < 종료)', () => {
  it('시작 전·시작 정각·종료 직전·종료 정각을 구분한다', () => {
    expect(scheduleStatus('14:00', '15:00', at('13:59'))).toBe('upcoming');
    expect(scheduleStatus('14:00', '15:00', at('14:00'))).toBe('current');
    expect(scheduleStatus('14:00', '15:00', at('14:59'))).toBe('current');
    expect(scheduleStatus('14:00', '15:00', at('15:00'))).toBe('past');
  });

  it('일정 사이 공백과 마지막 일정이 끝난 뒤에는 어떤 것도 진행 중이 아니다', () => {
    const items = [['09:00', '10:00'], ['11:00', '12:00']] as const;
    const current = (now: string) => items.filter(([start, end]) => scheduleStatus(start, end, at(now)) === 'current').length;
    expect(current('10:30')).toBe(0);
    expect(current('12:30')).toBe(0);
    expect(current('09:30')).toBe(1);
  });

  it('겹치는 일정은 모두 진행 중으로 본다', () => {
    const items = [['09:00', '11:00'], ['10:00', '12:00'], ['12:00', '13:00']] as const;
    const current = items.filter(([start, end]) => scheduleStatus(start, end, at('10:30')) === 'current');
    expect(current).toHaveLength(2);
  });

  it('시각이 없거나 틀렸거나 종료가 시작보다 빠르면 강조 대상에서 제외한다', () => {
    expect(scheduleStatus(null, '10:00', at('09:00'))).toBe('unknown');
    expect(scheduleStatus('09:00', undefined, at('09:30'))).toBe('unknown');
    expect(scheduleStatus('9:00', '10:00', at('09:30'))).toBe('unknown');
    expect(scheduleStatus('25:00', '26:00', at('09:30'))).toBe('unknown');
    expect(scheduleStatus('10:00', '09:00', at('09:30'))).toBe('unknown');
    expect(scheduleStatus('10:00', '10:00', at('10:00'))).toBe('unknown');
  });
});

describe('시각 도우미', () => {
  it('날짜에서 하루 중 분과 HH:MM 문구를 만든다', () => {
    const date = new Date(2026, 9, 4, 7, 5, 30);
    expect(minutesOfDay(date)).toBe(425);
    expect(formatNow(date)).toBe('07:05');
  });

  it('다음 분이 시작될 때까지 1분 이하로 기다린다', () => {
    expect(msUntilNextMinute(new Date(2026, 9, 4, 7, 5, 0, 0))).toBeGreaterThan(59_000);
    expect(msUntilNextMinute(new Date(2026, 9, 4, 7, 5, 59, 900))).toBeLessThan(200);
    expect(msUntilNextMinute(new Date(2026, 9, 4, 7, 5, 30, 0))).toBeLessThanOrEqual(30_100);
  });

  it('색을 흰색과 섞어 연하게 만들고 잘못된 값은 그대로 둔다', () => {
    expect(lightenColor('#000000', 0.5)).toBe('#808080');
    expect(lightenColor('#4F46E5', 0)).toBe('#4f46e5');
    expect(lightenColor('#4F46E5', 1)).toBe('#ffffff');
    expect(lightenColor('red', 0.5)).toBe('red');
  });
});
