import type { TimetableDatabase } from '../db/types';
import { buildTaskRollingNotifications, type TaskReminder } from '../utils/taskRollingNotifications';

import { replaceAndroidRollingSchedule } from './secureAlarmPoc';
import { createCoalescedRefresh } from '../utils/coalescedRefresh';

function dateKey(date: Date): string { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); }

/** P4.8 owns task lookup and 30-minute reminder generation. */
export async function buildTaskNotificationsFromDatabase(database: Pick<TimetableDatabase, 'getAllAsync'>, now = new Date(), familyId = 'local-family') {
  const tasks = await database.getAllAsync<TaskReminder>('SELECT id, title, repeat_weekdays AS repeatWeekdays, task_date AS taskDate, effective_from AS effectiveFrom, effective_until AS effectiveUntil, remind_time AS remindTime, alert_mode AS alertMode FROM tasks WHERE family_id = ? AND alert_mode <> \'none\' AND remind_time IS NOT NULL', familyId);
  const end = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6));
  const completed = await database.getAllAsync<{ readonly taskId: number; readonly completionDate: string }>('SELECT task_id AS taskId, completion_date AS completionDate FROM task_completions WHERE completion_date BETWEEN ? AND ?', dateKey(now), end);
  return buildTaskRollingNotifications(tasks, new Set(completed.map(({ taskId, completionDate }) => `${taskId}:${completionDate}`)), now);
}

/** Replaces only the tasks owner's native generation; the timetable owner is separate (see rollingSchedule.ts). */
export async function replaceRollingNotificationsFromDatabase(database: Pick<TimetableDatabase, 'getAllAsync'>, now = new Date(), familyId = 'local-family'): Promise<number> {
  const taskNotifications = await buildTaskNotificationsFromDatabase(database, now, familyId);
  return replaceAndroidRollingSchedule(taskNotifications.map(({ id, title, triggerAt, mode }) => ({ id, title, triggerAt: triggerAt.getTime(), mode })), 'tasks');
}

/**
 * 위젯에서 누른 체크를 먼저 DB에 반영한 뒤 할 일 알림을 예약한다. 위젯 갱신과 동시에 돌 때 반영 전 완료 상태로 예약하면
 * 끝낸 할 일의 알림이 남을 수 있어서다. 반영이 실패해도 예약은 계속한다(대기 체크는 남아 다음에 다시 시도된다).
 */
export async function replaceAfterPendingWidgetChecks<D extends Pick<TimetableDatabase, 'getAllAsync'>>(database: D, applyPending: (database: D) => Promise<number>, now = new Date()): Promise<number> {
  await applyPending(database).catch((error: unknown) => console.warn('TimeTable: 위젯 체크를 먼저 반영하지 못했어요.', error));
  return replaceRollingNotificationsFromDatabase(database, now, 'local-family');
}

async function refreshTaskRollingSchedule(): Promise<void> {
  const { getDatabase } = await import('../db/database');
  const database = await getDatabase();
  try {
    const { applyPendingWidgetChecksNow } = await import('../widgets/widgetRefresh');
    await replaceAfterPendingWidgetChecks(database, applyPendingWidgetChecksNow);
  } finally {
    // 할 일 저장·체크 뒤에도 위젯의 할 일 개수와 완료 상태가 맞도록 알림 예약 성공 여부와 무관하게 갱신한다
    // DB·네이티브 모듈이 이 파일을 불러오는 시점에 딸려 오지 않도록(순수 계산 테스트가 로딩되게) 동적으로 불러온다
    const { refreshWidgetQuietly } = await import('../widgets/widgetRefresh');
    await refreshWidgetQuietly();
  }
}

/** P4.8 owns this tasks-owner refresh after a task change or when its card opens. */
export const requestTaskRollingScheduleRefresh = createCoalescedRefresh(refreshTaskRollingSchedule);
