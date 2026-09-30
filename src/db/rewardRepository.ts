import { rewardForCompletedPlan, type GemReward } from '../rewards/rewardPolicy';
import type { TimetableDatabase } from './types';

type CountRow = { readonly count: number };
type LedgerRow = { readonly reason: string };
type RewardEntry = { readonly triggerDate: string; readonly reward: GemReward };
export type RewardDatabase = Pick<TimetableDatabase, 'execAsync' | 'getFirstAsync' | 'getAllAsync' | 'runAsync'>;

const familyId = 'local-family';
const childId = 'local-child';
const completionReason = (date: string) => `daily-completion:${date}`;
const rewardReason = (triggerDate: string, reward: GemReward) => `gem-reward:${reward.period}:${triggerDate}:${reward.kind}`;

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(year, month - 1, day + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

async function fullCompletionDates(database: RewardDatabase): Promise<readonly string[]> {
  const rows = await database.getAllAsync<LedgerRow>('SELECT reason FROM sticker_ledger WHERE family_id = ? AND reason LIKE ? ORDER BY reason ASC', familyId, 'daily-completion:%');
  return rows.map(({ reason }) => reason.slice('daily-completion:'.length)).sort();
}

function sunday(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return shiftDate(date, -new Date(year, month - 1, day).getDay());
}

function monthEnd(month: string): string {
  const [year, value] = month.split('-').map(Number);
  const date = new Date(year, value, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

/** A day with zero tasks assigned (e.g. a weekend) does not block a week/month "전체 완료" streak. */
async function hasTasksOn(database: RewardDatabase, date: string, weekday: number): Promise<boolean> {
  const total = await database.getFirstAsync<CountRow>(`SELECT COUNT(*) AS count FROM tasks WHERE family_id = ? AND (effective_until IS NULL OR effective_until >= ?) AND (task_date = ? OR (instr(',' || repeat_weekdays || ',', ',' || ? || ',') > 0 AND effective_from <= ?))`, familyId, date, date, String(weekday), date);
  return (total?.count ?? 0) > 0;
}

async function requiredDates(database: RewardDatabase, start: string, length: number): Promise<readonly string[]> {
  const dates = Array.from({ length }, (_, offset) => shiftDate(start, offset));
  const required: string[] = [];
  for (const date of dates) if (await hasTasksOn(database, date, weekdayOf(date))) required.push(date);
  return required;
}

function isPeriodComplete(dates: ReadonlySet<string>, required: readonly string[]): boolean {
  return required.length > 0 && required.every((date) => dates.has(date));
}

async function rewardsForDates(database: RewardDatabase, completedDates: readonly string[]): Promise<readonly RewardEntry[]> {
  const dates = new Set(completedDates);
  const entries: RewardEntry[] = [];
  for (const start of new Set(completedDates.map(sunday))) {
    if (isPeriodComplete(dates, await requiredDates(database, start, 7))) entries.push({ triggerDate: shiftDate(start, 6), reward: rewardForCompletedPlan('week') });
  }
  for (const month of new Set(completedDates.map((date) => date.slice(0, 7)))) {
    const end = monthEnd(month);
    const length = Number(end.slice(-2));
    if (isPeriodComplete(dates, await requiredDates(database, `${month}-01`, length))) entries.push({ triggerDate: end, reward: rewardForCompletedPlan('month') });
  }
  return entries.sort((left, right) => left.triggerDate.localeCompare(right.triggerDate) || left.reward.period.localeCompare(right.reward.period));
}

async function rebuildRewards(database: RewardDatabase): Promise<readonly RewardEntry[]> {
  const rewards = await rewardsForDates(database, await fullCompletionDates(database));
  const expected = new Set(rewards.map(({ triggerDate, reward }) => rewardReason(triggerDate, reward)));
  const existing = await database.getAllAsync<LedgerRow>('SELECT reason FROM sticker_ledger WHERE family_id = ? AND reason LIKE ?', familyId, 'gem-reward:%');
  for (const { reason } of existing) if (!expected.has(reason)) await database.runAsync('DELETE FROM sticker_ledger WHERE family_id = ? AND reason = ?', familyId, reason);
  for (const { triggerDate, reward } of rewards) if (!existing.some(({ reason }) => reason === rewardReason(triggerDate, reward))) await database.runAsync('INSERT INTO sticker_ledger (family_id, child_id, delta, reason) VALUES (?, ?, ?, ?)', familyId, childId, reward.amount, rewardReason(triggerDate, reward));
  return rewards;
}

async function isFullCompletion(database: RewardDatabase, date: string, weekday: number): Promise<boolean> {
  const incomplete = await database.getFirstAsync<CountRow>(`SELECT COUNT(*) AS count FROM tasks LEFT JOIN task_completions ON task_completions.task_id = tasks.id AND task_completions.completion_date = ? WHERE tasks.family_id = ? AND (tasks.task_date = ? OR (instr(',' || tasks.repeat_weekdays || ',', ',' || ? || ',') > 0 AND tasks.effective_from <= ?)) AND (tasks.effective_until IS NULL OR tasks.effective_until >= ?) AND task_completions.id IS NULL`, date, familyId, date, String(weekday), date, date);
  return (await hasTasksOn(database, date, weekday)) && (incomplete?.count ?? 0) === 0;
}

async function awardIfNew(database: RewardDatabase, date: string, weekday: number): Promise<GemReward | null> {
  if (!await isFullCompletion(database, date, weekday)) return null;
  const existing = await database.getFirstAsync<{ readonly id: number }>('SELECT id FROM sticker_ledger WHERE family_id = ? AND reason = ?', familyId, completionReason(date));
  if (existing) return null;
  // A week/month can end on a task-free day (H3), so the day just completed may not be the
  // period's calendar end date. Diff against what already existed instead of matching by date.
  const alreadyAwarded = new Set((await database.getAllAsync<LedgerRow>('SELECT reason FROM sticker_ledger WHERE family_id = ? AND reason LIKE ?', familyId, 'gem-reward:%')).map(({ reason }) => reason));
  await database.runAsync('INSERT INTO sticker_ledger (family_id, child_id, delta, reason) VALUES (?, ?, ?, ?)', familyId, childId, 0, completionReason(date));
  const rewards = await rebuildRewards(database);
  const rank = (reward: GemReward) => (reward.kind === 'large-gem' ? 1 : 0);
  return rewards.filter((entry) => !alreadyAwarded.has(rewardReason(entry.triggerDate, entry.reward)))
    .sort((left, right) => rank(right.reward) - rank(left.reward) || right.reward.amount - left.reward.amount)[0]?.reward ?? null;
}

// 앱은 하나의 DB 연결을 쓰므로, 화면의 체크와 위젯 체크 반영이 동시에 트랜잭션을 열면 서로의 문장이 섞이거나
// 'transaction within a transaction' 오류가 난다. 순서대로 하나씩 실행한다.
let transactionQueue: Promise<unknown> = Promise.resolve();

async function runTransaction<T>(database: RewardDatabase, action: () => Promise<T>): Promise<T> {
  await database.execAsync('BEGIN IMMEDIATE');
  try {
    const result = await action();
    await database.execAsync('COMMIT');
    return result;
  } catch (error) {
    await database.execAsync('ROLLBACK');
    throw error;
  }
}

function transaction<T>(database: RewardDatabase, action: () => Promise<T>): Promise<T> {
  const run = transactionQueue.then(() => runTransaction(database, action));
  transactionQueue = run.catch(() => undefined);
  return run;
}

export async function setTaskCompletionWithRewards(database: RewardDatabase, taskId: number, date: string, weekday: number, completed: boolean): Promise<GemReward | null> {
  return transaction(database, async () => {
    if (completed) {
      await database.runAsync('INSERT OR IGNORE INTO task_completions (task_id, completion_date) VALUES (?, ?)', taskId, date);
      await database.runAsync('INSERT OR IGNORE INTO task_completion_history (task_id, completion_date) VALUES (?, ?)', taskId, date);
      return awardIfNew(database, date, weekday);
    }
    await database.runAsync('DELETE FROM task_completions WHERE task_id = ? AND completion_date = ?', taskId, date);
    await database.runAsync('DELETE FROM sticker_ledger WHERE family_id = ? AND reason = ?', familyId, completionReason(date));
    await rebuildRewards(database);
    return null;
  });
}

export async function awardTodayCompletion(database: RewardDatabase, date: string, weekday: number): Promise<GemReward | null> {
  return transaction(database, () => awardIfNew(database, date, weekday));
}

export async function revokeTodayCompletion(database: RewardDatabase, date: string): Promise<void> {
  await transaction(database, async () => {
    await database.runAsync('DELETE FROM sticker_ledger WHERE family_id = ? AND reason = ?', familyId, completionReason(date));
    await rebuildRewards(database);
  });
}

export async function editTaskWithRewards(database: RewardDatabase, date: string, weekday: number, edit: () => Promise<void>): Promise<void> {
  await transaction(database, async () => {
    await edit();
    if (await isFullCompletion(database, date, weekday)) await awardIfNew(database, date, weekday);
    else await database.runAsync('DELETE FROM sticker_ledger WHERE family_id = ? AND reason = ?', familyId, completionReason(date));
    await rebuildRewards(database);
  });
}
