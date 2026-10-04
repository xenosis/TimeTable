import { rewardPolicy } from '../src/rewards/rewardPolicy';
it('never automatically awards gems for tasks, weeks or months', () => {
  expect(rewardPolicy.taskCompletionReward).toBeNull();
  expect(rewardPolicy.weeklyPlanReward).toBeNull();
  expect(rewardPolicy.monthlyPlanReward).toBeNull();
  expect(rewardPolicy.editableGemKinds).toEqual(['gem', 'large-gem']);
});
