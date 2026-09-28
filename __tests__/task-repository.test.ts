import { createTask, deleteTask, endRecurringTask, getEndableTasks, getTodayTasks, setTaskCompleted, updateTask } from '../src/db/taskRepository';

describe('today task repository', () => {
  it('loads date-specific and matching recurring tasks with completion state', async () => {
    const calls: unknown[][] = [];
    const database = { getAllAsync: async <T,>(...args: unknown[]) => { calls.push(args); return [] as T[]; } };
    await getTodayTasks(database, '2026-09-18', 5);
    expect(calls[0]).toEqual([expect.stringContaining('tasks.effective_from <= ?'), '2026-09-18', 'local-family', '2026-09-18', '2026-09-18', '5', '2026-09-18']);
  });
  it('adds or removes exactly one completion for the selected date', async () => {
    const calls: unknown[][] = [];
    const database = { getFirstAsync: async <T,>() => ({ count: 0 } as T), runAsync: async (...args: unknown[]) => { calls.push(args); return { changes: 1 }; } };
    await setTaskCompleted(database, 3, '2026-09-18', true);
    await setTaskCompleted(database, 3, '2026-09-18', false);
    expect(calls[0][0]).toContain('INSERT OR IGNORE');
    expect(calls[1]).toEqual(['INSERT OR IGNORE INTO task_completion_history (task_id, completion_date) VALUES (?, ?)', 3, '2026-09-18']);
    expect(calls[2]).toEqual(['DELETE FROM task_completions WHERE task_id = ? AND completion_date = ?', 3, '2026-09-18']);
  });
  it('creates, edits, and deletes a date or recurring task', async () => {
    const calls: unknown[][] = [];
    const database = { getFirstAsync: async <T,>() => ({ count: 0 } as T), runAsync: async (...args: unknown[]) => { calls.push(args); return { changes: 1 }; } };
    await createTask(database, { title: ' 숙제 ', repeatWeekdays: [1, 3], taskDate: '', effectiveFrom: '2026-09-19' });
    await updateTask(database, 7, { title: '독서', repeatWeekdays: [], taskDate: '2026-09-19', effectiveFrom: '' });
    await deleteTask(database, 7);
    expect(calls[0]).toEqual([expect.stringContaining('INSERT INTO tasks'), 'local-family', '숙제', '1,3', null, '2026-09-19', null, 'none']);
    expect(calls[1]).toEqual([expect.stringContaining('UPDATE tasks'), '독서', null, '2026-09-19', null, null, 'none', 7, 'local-family']);
    expect(calls[2]).toEqual(['DELETE FROM tasks WHERE id = ? AND family_id = ?', 7, 'local-family']);
  });
  it('rejects missing, conflicting, or malformed schedule input', async () => {
    const database = { runAsync: async () => undefined };
    await expect(createTask(database, { title: '', repeatWeekdays: [1], taskDate: '', effectiveFrom: '2026-09-19' })).rejects.toThrow('할 일 이름');
    await expect(createTask(database, { title: '숙제', repeatWeekdays: [1], taskDate: '2026-09-19', effectiveFrom: '2026-09-19' })).rejects.toThrow('하나만');
    await expect(createTask(database, { title: '숙제', repeatWeekdays: [], taskDate: '9/19', effectiveFrom: '' })).rejects.toThrow('YYYY-MM-DD');
    await expect(createTask(database, { title: '숙제', repeatWeekdays: [1], taskDate: '', effectiveFrom: '2026-09-19', alertMode: 'notify' })).rejects.toThrow('알림 시간');
    await expect(createTask(database, { title: '숙제', repeatWeekdays: [1], taskDate: '', effectiveFrom: '2026-09-19', remindTime: '7pm', alertMode: 'notify' })).rejects.toThrow('HH:MM');
  });
  it('blocks edits and deletion when completion history exists', async () => {
    const database = { getFirstAsync: async <T,>() => ({ count: 1 } as T), runAsync: async () => ({ changes: 1 }) };
    await expect(updateTask(database, 7, { title: '독서', repeatWeekdays: [1], taskDate: '', effectiveFrom: '2026-09-19' })).rejects.toThrow('완료 기록');
    await expect(deleteTask(database, 7)).rejects.toThrow('완료 기록');
  });
  it('lists only recurring tasks with completion history and no end date yet', async () => {
    const calls: unknown[][] = [];
    const database = { getAllAsync: async <T,>(...args: unknown[]) => { calls.push(args); return [{ id: 7, title: '숙제', repeatWeekdays: '1,3' }] as T[]; } };
    await expect(getEndableTasks(database)).resolves.toEqual([{ id: 7, title: '숙제', repeatWeekdays: '1,3' }]);
    expect(calls[0][0]).toEqual(expect.stringContaining('effective_until IS NULL'));
  });

  it('ends a recurring task from a given date without touching its history', async () => {
    const calls: unknown[][] = [];
    const database = { runAsync: async (...args: unknown[]) => { calls.push(args); return { changes: 1 }; } };
    await endRecurringTask(database, 7, '2026-09-19');
    expect(calls[0]).toEqual([expect.stringContaining('UPDATE tasks SET effective_until'), '2026-09-19', 7, 'local-family']);
  });

  it('rejects ending a task with an invalid date or one already ended', async () => {
    const database = { runAsync: async () => ({ changes: 0 }) };
    await expect(endRecurringTask(database, 7, '9/19')).rejects.toThrow('종료 날짜');
    await expect(endRecurringTask(database, 7, '2026-09-19')).rejects.toThrow('이미 변경');
  });

  it('keeps the edit lock after a completion is cancelled', async () => {
    const history = new Set<string>();
    const database = {
      getFirstAsync: async <T,>(sql: string, taskId: number) => ({ count: sql.includes('task_completion_history') && history.has(String(taskId)) ? 1 : 0 } as T),
      runAsync: async (sql: string, taskId: number) => { if (sql.includes('task_completion_history')) history.add(String(taskId)); return { changes: 1 }; },
    };
    await setTaskCompleted(database, 7, '2026-09-19', true);
    await setTaskCompleted(database, 7, '2026-09-19', false);
    await expect(updateTask(database, 7, { title: '독서', repeatWeekdays: [1], taskDate: '', effectiveFrom: '2026-09-19' })).rejects.toThrow('완료 기록');
    await expect(deleteTask(database, 7)).rejects.toThrow('완료 기록');
  });
});
