import type { RollingAlertMode } from './rollingNotifications';

export type TaskReminder = { readonly id: number; readonly title: string; readonly repeatWeekdays: string | null; readonly taskDate: string | null; readonly effectiveFrom: string | null; readonly remindTime: string | null; readonly alertMode: 'none' | RollingAlertMode };
export type TaskRollingNotification = { readonly id: string; readonly title: string; readonly triggerAt: Date; readonly mode: RollingAlertMode };

function dateKey(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function applies(task: TaskReminder, date: Date): boolean {
  const key = dateKey(date);
  if (task.taskDate) return task.taskDate === key;
  return Boolean(task.repeatWeekdays && task.effectiveFrom && task.effectiveFrom <= key && task.repeatWeekdays.split(',').map(Number).includes(date.getDay()));
}

export function buildTaskRollingNotifications(tasks: readonly TaskReminder[], completed: ReadonlySet<string>, now: Date, days = 7): readonly TaskRollingNotification[] {
  const result: TaskRollingNotification[] = [];
  const windowEnd = now.getTime() + days * 24 * 60 * 60 * 1000;
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const key = dateKey(date);
    for (const task of tasks) {
      if (task.alertMode === 'none' || !task.remindTime || !applies(task, date) || completed.has(`${task.id}:${key}`)) continue;
      const [hours, minutes] = task.remindTime.split(':').map(Number);
      const first = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
      for (const [suffix, triggerAt] of [['first', first], ['repeat', new Date(first.getTime() + 30 * 60 * 1000)]] as const) {
        if (triggerAt >= now && triggerAt.getTime() < windowEnd) result.push({ id: `task:${task.id}:${key}:${suffix}`, title: task.title, triggerAt, mode: task.alertMode });
      }
    }
  }
  return result.sort((left, right) => left.triggerAt.getTime() - right.triggerAt.getTime());
}
