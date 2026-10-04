import { getStickerSummary } from './stickerRepository';
import { withRewardTransaction, type RewardDatabase } from './rewardRepository';

export type GemCounts = { readonly gems: number; readonly largeGems: number };
export const maximumGemCount = 99999;
/** Append an adjustment: preserve earned/spent history and serialize against task/widget writes. */
export async function updateGemCounts(database: RewardDatabase, counts: GemCounts): Promise<void> {
  if (![counts.gems, counts.largeGems].every((count) => Number.isSafeInteger(count) && count >= 0 && count <= maximumGemCount)) throw new Error('보석 개수는 0~99,999 사이의 정수로 적어 주세요.');
  await withRewardTransaction(database, async () => {
    const current = await getStickerSummary(database);
    for (const [kind, delta] of [['gem', counts.gems - current.gems], ['large-gem', counts.largeGems - current.largeGems]] as const) {
      if (delta !== 0) await database.runAsync('INSERT INTO sticker_ledger (family_id, child_id, delta, reason) VALUES (?, ?, ?, ?)', 'local-family', 'local-child', delta, `manual-count:${kind}`);
    }
  });
}
