import { completedDayStreak } from '../src/utils/streak';
describe('completedDayStreak', () => {
  it('counts consecutive completed dates ending today', () => expect(completedDayStreak(['2026-09-17', '2026-09-18', '2026-09-19'], '2026-09-19')).toBe(3));

  it('keeps yesterday\'s streak visible before today is completed', () => expect(completedDayStreak(['2026-09-17', '2026-09-18'], '2026-09-19')).toBe(2));

  it('returns 0 once the streak is actually broken', () => expect(completedDayStreak(['2026-09-15', '2026-09-16'], '2026-09-19')).toBe(0));

  it('counts today once it is completed', () => expect(completedDayStreak(['2026-09-18', '2026-09-19'], '2026-09-19')).toBe(2));
});
