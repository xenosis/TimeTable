/** Gems are physical rewards. The app records child-entered counts, not task awards. */
export const rewardPolicy = {
  taskCompletionReward: null,
  weeklyPlanReward: null,
  monthlyPlanReward: null,
  editableGemKinds: ['gem', 'large-gem'],
  /** 할 일을 모두 끝낸 날이 이만큼 연속될 때마다 실물 보석을 받을 자격이 1개 생긴다(아빠 폰이 생기면 아빠가 바꿀 수 있게 옮긴다). */
  giftStreakDays: 5,
} as const;
