import { getDayExceptionsInRange } from '../db/dayExceptionRepository';
import type { TimetableDatabase } from '../db/types';
import { buildRollingNotifications, type RollingNotification, type RollingScheduleItem } from '../utils/rollingNotifications';
import { replaceAndroidRollingSchedule } from './secureAlarmPoc';

function dateKey(date: Date): string { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); }

export async function buildNotificationsFromDatabase(database: Pick<TimetableDatabase, 'getAllAsync'>, items: readonly RollingScheduleItem[], now: Date, days = 7, familyId = 'local-family'): Promise<readonly RollingNotification[]> {
  const maximumLead = Math.max(0, ...items.map((item) => item.alertBeforeMin));
  const end = new Date(now.getTime() + (days * 24 * 60 + maximumLead) * 60 * 1000);
  return buildRollingNotifications(items, await getDayExceptionsInRange(database, dateKey(now), dateKey(end), familyId), now, days);
}

export async function buildTimetableNotificationsFromDatabase(database: Pick<TimetableDatabase, 'getAllAsync'>, setId: number, now = new Date(), familyId = 'local-family'): Promise<readonly RollingNotification[]> {
  const items = await database.getAllAsync<RollingScheduleItem>(`SELECT timetable_items.id, timetable_items.weekday, COALESCE(periods.start_time, timetable_items.start_time) AS startTime, timetable_items.title, timetable_items.category, timetable_items.alert_mode AS alertMode, timetable_items.alert_before_min AS alertBeforeMin FROM timetable_items LEFT JOIN periods ON periods.family_id = timetable_items.family_id AND periods.period_no = timetable_items.period_no WHERE timetable_items.family_id = ? AND timetable_items.set_id = ?`, familyId, setId);
  return buildNotificationsFromDatabase(database, items, now, 7, familyId);
}

export async function replaceTimetableRollingNotificationsFromDatabase(database: Pick<TimetableDatabase, 'getAllAsync'>, setId: number, now = new Date(), familyId = 'local-family'): Promise<number> {
  const notifications = await buildTimetableNotificationsFromDatabase(database, setId, now, familyId);
  return replaceAndroidRollingSchedule(notifications.map(({ id, title, triggerAt, mode }) => ({ id, title, triggerAt: triggerAt.getTime(), mode })), 'timetable');
}
