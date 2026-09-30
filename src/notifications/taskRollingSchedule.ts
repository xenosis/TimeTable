import type { TimetableDatabase } from '../db/types';
import { buildTaskRollingNotifications, type TaskReminder } from '../utils/taskRollingNotifications';

import { replaceAndroidRollingSchedule } from './secureAlarmPoc';
import { createCoalescedRefresh } from '../utils/coalescedRefresh';

function dateKey(date: Date): string { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); }

/** P4.8 owns task lookup and 30-minute reminder generation. */
export async function buildTaskNotificationsFromDatabase(database: Pick<TimetableDatabase, 'getAllAsync'>, now = new Date(), familyId = 'local-family') {
  const tasks = await database.getAllAsync<TaskReminder>('SELECT id, title, repeat_weekdays AS repeatWeekdays, task_date AS taskDate, effective_from AS effectiveFrom, remind_time AS remindTime, alert_mode AS alertMode FROM tasks WHERE family_id = ? AND alert_mode <> \'none\' AND remind_time IS NOT NULL', familyId);
  const end = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6));
  const completed = await database.getAllAsync<{ readonly taskId: number; readonly completionDate: string }>('SELECT task_id AS taskId, completion_date AS completionDate FROM task_completions WHERE completion_date BETWEEN ? AND ?', dateKey(now), end);
  return buildTaskRollingNotifications(tasks, new Set(completed.map(({ taskId, completionDate }) => `${taskId}:${completionDate}`)), now);
}

/** Replaces only the tasks owner's native generation; the timetable owner is separate (see rollingSchedule.ts). */
export async function replaceRollingNotificationsFromDatabase(database: Pick<TimetableDatabase, 'getAllAsync'>, now = new Date(), familyId = 'local-family'): Promise<number> {
  const taskNotifications = await buildTaskNotificationsFromDatabase(database, now, familyId);
  return replaceAndroidRollingSchedule(taskNotifications.map(({ id, title, triggerAt, mode }) => ({ id, title, triggerAt: triggerAt.getTime(), mode })), 'tasks');
}

async function refreshTaskRollingSchedule(): Promise<void> {
  const { getDatabase } = await import('../db/database');
  const database = await getDatabase();
  await replaceRollingNotificationsFromDatabase(database, new Date(), 'local-family');
}

/** P4.8 owns this tasks-owner refresh after a task change or when its card opens. */
export const requestTaskRollingScheduleRefresh = createCoalescedRefresh(refreshTaskRollingSchedule);
