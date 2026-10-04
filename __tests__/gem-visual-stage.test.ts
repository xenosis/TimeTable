import { gemVisualStage } from '../src/theme/gemVisualStage';

describe('gem artwork stages (display only)', () => {
  it.each([[0, 0], [1, 1], [4, 1], [5, 2], [14, 2], [15, 3], [29, 3], [30, 4], [99999, 4]])('uses the stage boundary at %i ordinary gems', (gems, tier) => {
    expect(gemVisualStage({ gems, largeGems: 0 }).tier).toBe(tier);
  });
  it('uses five ordinary gems per large gem without mutating the counts', () => {
    const counts = Object.freeze({ gems: 2, largeGems: 3 });
    expect(gemVisualStage(counts)).toMatchObject({ points: 17, tier: 3 });
    expect(counts).toEqual({ gems: 2, largeGems: 3 });
  });
  it('reflects reducing manual counts and clamps invalid legacy values for artwork', () => {
    expect(gemVisualStage({ gems: 1, largeGems: 0 }).tier).toBe(1);
    expect(gemVisualStage({ gems: 0, largeGems: 0 }).tier).toBe(0);
    expect(gemVisualStage({ gems: -3, largeGems: NaN }).points).toBe(0);
  });
});
