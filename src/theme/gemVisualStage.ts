type GemVisualCounts = { readonly gems: number; readonly largeGems: number };
export type GemVisualStage = { readonly points: number; readonly tier: 0 | 1 | 2 | 3 | 4; readonly label: string };
const labels = ['보석함 준비 중', '첫 반짝임', '반짝반짝', '보석이 한가득', '눈부신 보석함'] as const;

/** Visual growth only: never converts balances, awards gems, or changes gift goals. */
export function gemVisualStage(counts: GemVisualCounts): GemVisualStage {
  const validCount = (value: number) => Number.isSafeInteger(value) && value > 0 ? value : 0;
  const points = validCount(counts.gems) + validCount(counts.largeGems) * 5;
  const tier = points >= 30 ? 4 : points >= 15 ? 3 : points >= 5 ? 2 : points > 0 ? 1 : 0;
  return { points, tier, label: labels[tier] };
}
