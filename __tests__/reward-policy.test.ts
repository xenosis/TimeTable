import { rewardForCompletedPlan, rewardPolicy } from '../src/rewards/rewardPolicy';

describe('rewardPolicy', () => {
  it('does not reward individual tasks or a single completed day', () => {
    expect(rewardPolicy.taskCompletionReward).toBeNull();
  });
  it('uses configurable weekly and monthly plan rewards', () => {
    expect(rewardForCompletedPlan('week')).toEqual({ kind: 'gem', amount: 1, period: 'week' });
    expect(rewardForCompletedPlan('month')).toEqual({ kind: 'large-gem', amount: 1, period: 'month' });
  });
});
