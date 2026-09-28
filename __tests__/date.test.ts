import { msUntilNextLocalMidnight, toLocalDateStr, weekdayLabel } from '../src/utils/date';

describe('toLocalDateStr', () => {
  it('한 자리 월/일을 0으로 채운다', () => {
    expect(toLocalDateStr(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('두 자리 월/일도 올바르게 만든다', () => {
    expect(toLocalDateStr(new Date(2026, 11, 25))).toBe('2026-12-25');
  });
});

describe('weekdayLabel', () => {
  it('요일 인덱스를 한글로 바꾼다', () => {
    expect(weekdayLabel(0)).toBe('일');
    expect(weekdayLabel(1)).toBe('월');
    expect(weekdayLabel(6)).toBe('토');
  });
});

describe('msUntilNextLocalMidnight', () => {
  it('자정 직후에는 거의 하루 전체를 남긴다', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 8, 27, 0, 0, 0, 0))).toBe(24 * 60 * 60 * 1000);
  });

  it('자정 1분 전에는 1분만 남긴다', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 8, 27, 23, 59, 0, 0))).toBe(60 * 1000);
  });

  it('자정 정각에도 0이 아니라 다음 날 자정까지를 반환한다', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 8, 27, 0, 0, 0, 0))).toBeGreaterThan(0);
  });

  it('월을 넘어갈 때도 올바르게 계산한다', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 8, 30, 23, 0, 0, 0))).toBe(60 * 60 * 1000);
  });

  it('연을 넘어갈 때도 올바르게 계산한다', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 11, 31, 23, 30, 0, 0))).toBe(30 * 60 * 1000);
  });
});
