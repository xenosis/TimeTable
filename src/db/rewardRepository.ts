import { syncGemRightForDate } from './gemRightRepository';
import type { TimetableDatabase } from './types';

export type RewardDatabase = Pick<TimetableDatabase, 'execAsync' | 'getFirstAsync' | 'getAllAsync' | 'runAsync'>;
const familyId = 'local-family';
const childId = 'local-child';
const completionReason = (date: string) => `daily-completion:${date}`;

// 하루 전체 완료 판정. 할 일은 '만든 날부터만' 센다(date(created_at,'localtime') <= date): 시작일을 과거로 정해 만들어도 만들기 전 날은 대상이 아니다.
// 이 규칙은 연속 달성 계산(taskDayQuery.hasTasksOn)과 같아야 한다. 여기서 만든 완료 기록(delta 0)은 보석을 늘리지 않고, 연속·자격 계산에만 쓰인다.
async function isFullCompletion(database: RewardDatabase, date: string, weekday: number): Promise<boolean> {
  const total = await database.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM tasks WHERE family_id = ? AND (effective_until IS NULL OR effective_until >= ?) AND (task_date = ? OR (instr(',' || repeat_weekdays || ',', ',' || ? || ',') > 0 AND effective_from <= ?)) AND date(created_at, 'localtime') <= ?`, familyId, date, date, String(weekday), date, date);
  const incomplete = await database.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM tasks LEFT JOIN task_completions ON task_completions.task_id = tasks.id AND task_completions.completion_date = ? WHERE tasks.family_id = ? AND (tasks.task_date = ? OR (instr(',' || tasks.repeat_weekdays || ',', ',' || ? || ',') > 0 AND tasks.effective_from <= ?)) AND (tasks.effective_until IS NULL OR tasks.effective_until >= ?) AND date(tasks.created_at, 'localtime') <= ? AND task_completions.id IS NULL`, date, familyId, date, String(weekday), date, date, date);
  return (total?.count ?? 0) > 0 && (incomplete?.count ?? 0) === 0;
}

async function recordCompletion(database: RewardDatabase, date: string, weekday: number): Promise<void> {
  if (!await isFullCompletion(database, date, weekday)) return;
  // Completion history is for praise/streaks only. Physical gems are entered by the child.
  await database.runAsync('INSERT OR IGNORE INTO sticker_ledger (family_id, child_id, delta, reason) VALUES (?, ?, ?, ?)', familyId, childId, 0, completionReason(date));
  await syncGemRightForDate(database, date); // 연속이 5의 배수가 되는 날이면 실물 보석을 받을 자격이 생긴다
}

async function clearCompletion(database: RewardDatabase, date: string): Promise<void> {
  await database.runAsync('DELETE FROM sticker_ledger WHERE family_id = ? AND reason = ?', familyId, completionReason(date));
  await syncGemRightForDate(database, date); // 그날 체크를 취소했으면 아직 요청하지 않은 그날의 자격도 없앤다
}

let transactionQueue: Promise<unknown> = Promise.resolve();
/** 체크·보석 기록과 동기화 교체가 서로 겹치지 않게 한 줄로 세운다(트랜잭션은 action이 직접 연다). */
export function withRewardQueue<T>(action: () => Promise<T>): Promise<T> {
  const run = transactionQueue.then(action);
  transactionQueue = run.catch(() => undefined);
  return run;
}
export function withRewardTransaction<T>(database: RewardDatabase, action: () => Promise<T>): Promise<T> {
  return withRewardQueue(async () => {
    await database.execAsync('BEGIN IMMEDIATE');
    try { const result = await action(); await database.execAsync('COMMIT'); return result; }
    catch (error) { await database.execAsync('ROLLBACK'); throw error; }
  });
}

export async function setTaskCompletionWithRewards(database: RewardDatabase, taskId: number, date: string, weekday: number, completed: boolean): Promise<null> {
  return withRewardTransaction(database, async () => {
    if (completed) {
      await database.runAsync('INSERT OR IGNORE INTO task_completions (task_id, completion_date) VALUES (?, ?)', taskId, date);
      await database.runAsync('INSERT OR IGNORE INTO task_completion_history (task_id, completion_date) VALUES (?, ?)', taskId, date);
      await recordCompletion(database, date, weekday);
    } else {
      await database.runAsync('DELETE FROM task_completions WHERE task_id = ? AND completion_date = ?', taskId, date);
      await clearCompletion(database, date);
    }
    return null;
  });
}

export async function awardTodayCompletion(database: RewardDatabase, date: string, weekday: number): Promise<null> {
  return withRewardTransaction(database, async () => { await recordCompletion(database, date, weekday); return null; });
}
export async function revokeTodayCompletion(database: RewardDatabase, date: string): Promise<void> {
  await withRewardTransaction(database, () => clearCompletion(database, date));
}
export async function editTaskWithRewards(database: RewardDatabase, date: string, weekday: number, edit: () => Promise<void>): Promise<void> {
  await withRewardTransaction(database, async () => {
    await edit();
    if (await isFullCompletion(database, date, weekday)) await recordCompletion(database, date, weekday);
    else await clearCompletion(database, date);
  });
}
