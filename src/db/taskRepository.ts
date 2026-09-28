import type { TimetableDatabase } from './types';

export type TodayTask = { readonly id: number; readonly title: string; readonly completed: number };
export type TaskAlertMode = 'none' | 'notify' | 'alarm';
export type EditableTask = { readonly id: number; readonly title: string; readonly repeatWeekdays: string | null; readonly taskDate: string | null; readonly effectiveFrom: string | null; readonly remindTime: string | null; readonly alertMode: TaskAlertMode };
export type EndableTask = { readonly id: number; readonly title: string; readonly repeatWeekdays: string };
export type TaskInput = { readonly title: string; readonly repeatWeekdays: readonly number[]; readonly taskDate: string; readonly effectiveFrom: string; readonly remindTime?: string; readonly alertMode?: TaskAlertMode };

export async function getEditableTasks(database: Pick<TimetableDatabase, 'getAllAsync'>): Promise<readonly EditableTask[]> {
  return database.getAllAsync<EditableTask>(
    `SELECT id, title, repeat_weekdays AS repeatWeekdays, task_date AS taskDate, effective_from AS effectiveFrom, remind_time AS remindTime, alert_mode AS alertMode
     FROM tasks WHERE family_id = ? AND NOT EXISTS (SELECT 1 FROM task_completion_history WHERE task_completion_history.task_id = tasks.id)
     ORDER BY task_date IS NULL, task_date, id`,
    'local-family',
  );
}

/** Repeating tasks that already have completion history: title/days can no longer change, but they
 * can still be ended from today so they stop appearing, without touching their past record. */
export async function getEndableTasks(database: Pick<TimetableDatabase, 'getAllAsync'>): Promise<readonly EndableTask[]> {
  return database.getAllAsync<EndableTask>(
    `SELECT id, title, repeat_weekdays AS repeatWeekdays
     FROM tasks
     WHERE family_id = ? AND repeat_weekdays IS NOT NULL AND effective_until IS NULL
       AND EXISTS (SELECT 1 FROM task_completion_history WHERE task_completion_history.task_id = tasks.id)
     ORDER BY id`,
    'local-family',
  );
}

export async function endRecurringTask(database: Pick<TimetableDatabase, 'runAsync'>, id: number, effectiveUntil: string): Promise<void> {
  if (!validDate(effectiveUntil)) throw new Error('종료 날짜가 올바르지 않아요.');
  const result = await database.runAsync('UPDATE tasks SET effective_until = ? WHERE id = ? AND family_id = ? AND effective_until IS NULL', effectiveUntil, id, 'local-family') as { readonly changes?: number };
  if (result.changes === 0) throw new Error('항목이 이미 변경되었거나 없어요.');
}

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = match && new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return !!date && date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
}

function params(input: TaskInput): readonly [string, string | null, string | null, string | null, string | null, TaskAlertMode] {
  const title = input.title.trim();
  if (!title) throw new Error('할 일 이름을 입력해 주세요.');
  if (!input.repeatWeekdays.length && !input.taskDate) throw new Error('반복 요일 또는 날짜를 선택해 주세요.');
  if (input.repeatWeekdays.length && input.taskDate) throw new Error('반복 요일과 날짜 중 하나만 선택해 주세요.');
  if (input.repeatWeekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('반복 요일을 다시 선택해 주세요.');
  if (input.taskDate) {
    if (!validDate(input.taskDate)) throw new Error('실제 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.');
  }
  if (input.repeatWeekdays.length && !validDate(input.effectiveFrom)) throw new Error('반복 할 일의 시작 날짜가 필요해요.');
  const remindTime = input.remindTime?.trim() ?? '';
  const alertMode = input.alertMode ?? 'none';
  if (!['none', 'notify', 'alarm'].includes(alertMode)) throw new Error('알림 방식을 다시 선택해 주세요.');
  if (remindTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(remindTime)) throw new Error('알림 시간은 HH:MM으로 입력해 주세요.');
  if (alertMode !== 'none' && !remindTime) throw new Error('알림 시간을 입력해 주세요.');
  return [title, input.repeatWeekdays.length ? input.repeatWeekdays.join(',') : null, input.taskDate || null, input.repeatWeekdays.length ? input.effectiveFrom : null, remindTime || null, alertMode];
}

export async function createTask(database: Pick<TimetableDatabase, 'runAsync'>, input: TaskInput): Promise<void> {
  const [title, repeatWeekdays, taskDate, effectiveFrom, remindTime, alertMode] = params(input);
  await database.runAsync('INSERT INTO tasks (family_id, title, repeat_weekdays, task_date, effective_from, remind_time, alert_mode) VALUES (?, ?, ?, ?, ?, ?, ?)', 'local-family', title, repeatWeekdays, taskDate, effectiveFrom, remindTime, alertMode);
}

async function assertNoCompletionHistory(database: Pick<TimetableDatabase, 'getFirstAsync'>, id: number): Promise<void> {
  const row = await database.getFirstAsync<{ readonly count: number }>('SELECT COUNT(*) AS count FROM task_completion_history WHERE task_id = ?', id);
  if ((row?.count ?? 0) > 0) throw new Error('완료 기록이 있는 할 일은 수정하거나 삭제할 수 없어요. 새 할 일을 만들어 주세요.');
}

export async function updateTask(database: Pick<TimetableDatabase, 'getFirstAsync' | 'runAsync'>, id: number, input: TaskInput): Promise<void> {
  const [title, repeatWeekdays, taskDate, effectiveFrom, remindTime, alertMode] = params(input);
  await assertNoCompletionHistory(database, id);
  const result = await database.runAsync('UPDATE tasks SET title = ?, repeat_weekdays = ?, task_date = ?, effective_from = ?, remind_time = ?, alert_mode = ? WHERE id = ? AND family_id = ?', title, repeatWeekdays, taskDate, effectiveFrom, remindTime, alertMode, id, 'local-family') as { readonly changes?: number };
  if (result.changes === 0) throw new Error('항목이 이미 변경되었거나 없어요.');
}

export async function deleteTask(database: Pick<TimetableDatabase, 'getFirstAsync' | 'runAsync'>, id: number): Promise<void> {
  await assertNoCompletionHistory(database, id);
  const result = await database.runAsync('DELETE FROM tasks WHERE id = ? AND family_id = ?', id, 'local-family') as { readonly changes?: number };
  if (result.changes === 0) throw new Error('항목이 이미 변경되었거나 없어요.');
}

export async function getTodayTasks(database: Pick<TimetableDatabase, 'getAllAsync'>, date: string, weekday: number): Promise<readonly TodayTask[]> {
  return database.getAllAsync<TodayTask>(
    `SELECT tasks.id, tasks.title, CASE WHEN task_completions.id IS NULL THEN 0 ELSE 1 END AS completed
     FROM tasks LEFT JOIN task_completions ON task_completions.task_id = tasks.id AND task_completions.completion_date = ?
     WHERE tasks.family_id = ? AND (tasks.effective_until IS NULL OR tasks.effective_until >= ?)
       AND (tasks.task_date = ? OR (instr(',' || tasks.repeat_weekdays || ',', ',' || ? || ',') > 0 AND tasks.effective_from <= ?))
     ORDER BY tasks.id`, date, 'local-family', date, date, String(weekday), date,
  );
}

export async function setTaskCompleted(database: Pick<TimetableDatabase, 'runAsync'>, taskId: number, date: string, completed: boolean): Promise<void> {
  if (completed) { await database.runAsync('INSERT OR IGNORE INTO task_completions (task_id, completion_date) VALUES (?, ?)', taskId, date); await database.runAsync('INSERT OR IGNORE INTO task_completion_history (task_id, completion_date) VALUES (?, ?)', taskId, date); }
  else await database.runAsync('DELETE FROM task_completions WHERE task_id = ? AND completion_date = ?', taskId, date);
}
