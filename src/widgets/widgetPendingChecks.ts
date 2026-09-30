import { setTaskCompletionWithRewards, type RewardDatabase } from '../db/rewardRepository';

/** 위젯의 할 일 줄을 눌러 남은 체크 한 건. 앱이 실행될 때 DB에 기록한다. */
export type PendingWidgetCheck = { readonly taskId: number; readonly date: string; readonly completed: boolean };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 네이티브가 넘긴 JSON을 읽는다. 깨진 항목은 버리고 같은 (할 일, 날짜)는 가장 마지막 상태만 남긴다. */
export function parsePendingWidgetChecks(payload: string | null | undefined): readonly PendingWidgetCheck[] {
  if (!payload) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(payload); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const latest = new Map<string, PendingWidgetCheck>();
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const { taskId, date, completed } = item as Record<string, unknown>;
    if (typeof taskId !== 'number' || !Number.isInteger(taskId) || taskId < 0) continue;
    if (typeof date !== 'string' || !DATE_PATTERN.test(date) || typeof completed !== 'boolean') continue;
    const key = `${taskId}:${date}`;
    latest.delete(key); // 나중 것이 뒤로 가도록
    latest.set(key, { taskId, date, completed });
  }
  return [...latest.values()];
}

function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

async function taskExists(database: RewardDatabase, taskId: number): Promise<boolean> {
  return (await database.getFirstAsync<{ id: number }>('SELECT id FROM tasks WHERE id = ?', taskId)) != null;
}

/**
 * 위젯에서 누른 체크를 앱 안에서 체크하는 것과 같은 함수(setTaskCompletionWithRewards)로 기록한다.
 * 그래서 중복 방지와 보석 계산 규칙이 앱 체크와 똑같다. 새로 기록한 개수를 돌려준다.
 *
 * 기록에 성공했거나 그새 지워진 할 일의 체크만 [ack]로 대기 목록에서 지운다. 일시적인 오류로 기록하지 못한 체크는
 * 지우지 않고 남겨 다음에 다시 시도한다(앱이 기록 도중에 죽어도 체크가 사라지지 않는다).
 */
export async function applyPendingWidgetChecks(
  database: RewardDatabase,
  peek: () => Promise<string | null | undefined>,
  ack: (applied: string) => Promise<void> = async () => undefined,
): Promise<number> {
  let payload: string | null | undefined;
  try { payload = await peek(); } catch (error) {
    console.warn('TimeTable: 위젯에서 누른 체크를 읽지 못했어요.', error);
    return 0;
  }
  const checks = parsePendingWidgetChecks(payload);
  const done: PendingWidgetCheck[] = [];
  let applied = 0;
  for (const check of checks) {
    try {
      if (!await taskExists(database, check.taskId)) { done.push(check); continue; } // 지워진 할 일의 체크는 버린다
      await setTaskCompletionWithRewards(database, check.taskId, check.date, weekdayOf(check.date), check.completed);
      done.push(check);
      applied += 1;
    } catch (error) {
      console.warn('TimeTable: 위젯 체크를 기록하지 못했어요. 다음에 다시 시도해요.', error);
    }
  }
  if (done.length) {
    try { await ack(JSON.stringify(done)); } catch (error) { console.warn('TimeTable: 위젯 체크 기록 확인을 남기지 못했어요.', error); }
  }
  return applied;
}
