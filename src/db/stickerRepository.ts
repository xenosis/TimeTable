import type { TimetableDatabase } from './types';

export type RewardGoal = { readonly id: number; readonly title: string; readonly stickerGoal: number };
export type StickerSummary = { readonly gems: number; readonly largeGems: number; readonly total: number; readonly goal: RewardGoal | null; readonly remaining: number | null };
type LedgerRow = { readonly reason: string; readonly delta: number };
type RewardRow = RewardGoal;

const familyId = 'local-family';
const childId = 'local-child';

export async function getStickerSummary(database: Pick<TimetableDatabase, 'getFirstAsync' | 'getAllAsync'>): Promise<StickerSummary> {
  const ledger = await database.getAllAsync<LedgerRow>('SELECT reason, delta FROM sticker_ledger WHERE family_id = ?', familyId);
  const gems = ledger.filter(({ reason }) => !reason.endsWith(':large-gem')).reduce((total, { delta }) => total + delta, 0);
  const largeGems = ledger.filter(({ reason }) => reason.endsWith(':large-gem')).reduce((total, { delta }) => total + delta, 0);
  const goal = await database.getFirstAsync<RewardRow>('SELECT id, title, sticker_goal AS stickerGoal FROM rewards WHERE family_id = ? AND achieved_at IS NULL ORDER BY id LIMIT 1', familyId);
  return { gems, largeGems, total: gems + largeGems, goal, remaining: goal === null ? null : Math.max(0, goal.stickerGoal - gems - largeGems) };
}

export async function addRewardGoal(database: Pick<TimetableDatabase, 'runAsync'>, title: string, stickerGoal: number): Promise<void> {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error('보상 이름을 입력해 주세요.');
  if (!Number.isInteger(stickerGoal) || stickerGoal < 1) throw new Error('필요한 보석 수는 1 이상이어야 해요.');
  await database.runAsync('INSERT INTO rewards (family_id, title, sticker_goal) VALUES (?, ?, ?)', familyId, cleanTitle, stickerGoal);
}

/** Marks the goal achieved and spends every gem currently on the board, so the next goal starts from zero. */
export async function markRewardAchieved(database: Pick<TimetableDatabase, 'runAsync' | 'getFirstAsync' | 'getAllAsync'>, rewardId: number): Promise<void> {
  const updated = await database.runAsync("UPDATE rewards SET achieved_at = CURRENT_TIMESTAMP WHERE id = ? AND family_id = ? AND achieved_at IS NULL", rewardId, familyId) as { readonly changes?: number };
  if (updated.changes === 0) return;
  const summary = await getStickerSummary(database);
  if (summary.gems > 0) await database.runAsync('INSERT INTO sticker_ledger (family_id, child_id, delta, reason) VALUES (?, ?, ?, ?)', familyId, childId, -summary.gems, `reward-spent:${rewardId}`);
  if (summary.largeGems > 0) await database.runAsync('INSERT INTO sticker_ledger (family_id, child_id, delta, reason) VALUES (?, ?, ?, ?)', familyId, childId, -summary.largeGems, `reward-spent:${rewardId}:large-gem`);
}

export async function getCompletedDates(database: Pick<TimetableDatabase, 'getAllAsync'>): Promise<readonly string[]> {
  const rows = await database.getAllAsync<{ readonly reason: string }>('SELECT reason FROM sticker_ledger WHERE family_id = ? AND reason LIKE ? ORDER BY reason', 'local-family', 'daily-completion:%');
  return rows.map(({ reason }) => reason.slice('daily-completion:'.length));
}
