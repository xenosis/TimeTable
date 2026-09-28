export type RewardPeriod = 'week' | 'month';

export type GemReward = { readonly kind: 'gem' | 'large-gem'; readonly amount: number; readonly period: RewardPeriod };

export type RewardPolicy = {
  readonly taskCompletionReward: null;
  readonly weeklyPlanReward: GemReward;
  readonly monthlyPlanReward: GemReward;
};

export const rewardPolicy: RewardPolicy = {
  taskCompletionReward: null,
  weeklyPlanReward: { kind: 'gem', amount: 1, period: 'week' },
  monthlyPlanReward: { kind: 'large-gem', amount: 1, period: 'month' },
};

export function rewardForCompletedPlan(period: RewardPeriod, policy: RewardPolicy = rewardPolicy): GemReward {
  return period === 'week' ? policy.weeklyPlanReward : policy.monthlyPlanReward;
}
