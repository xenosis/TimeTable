import { dailyEncouragement } from '../src/theme/dailyEncouragement';

describe('daily encouragement', () => {
  it('keeps the same pair throughout a local day and when requested again', () => {
    const morning = dailyEncouragement(new Date(2026, 9, 4, 0, 0));
    expect(dailyEncouragement(new Date(2026, 9, 4, 23, 59))).toEqual(morning);
    expect(dailyEncouragement(new Date(2026, 9, 4, 12))).toEqual(morning);
  });
  it('changes both lines at midnight and handles month/year boundaries', () => {
    for (const date of [new Date(2026, 9, 4), new Date(2026, 9, 31), new Date(2026, 11, 31)]) {
      const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
      expect(dailyEncouragement(next).title).not.toBe(dailyEncouragement(date).title);
      expect(dailyEncouragement(next).subtitle).not.toBe(dailyEncouragement(date).subtitle);
    }
  });
  it('offers twenty different pairs before repeating', () => {
    const pairs = Array.from({ length: 20 }, (_, day) => dailyEncouragement(new Date(2026, 9, day + 1)));
    expect(new Set(pairs.map(({ title }) => title)).size).toBe(20);
    expect(pairs.every(({ subtitle }) => subtitle.length > 0)).toBe(true);
  });
});
