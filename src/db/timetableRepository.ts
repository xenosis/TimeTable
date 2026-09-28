import { alertModes, timetableCategories, timetableModes, type TimetableDatabase, type TimetableItemInput, type TimetableMode } from './types';
import type { ColorKey, IconKey } from '../theme';

const clockPattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function requireValidItem(item: TimetableItemInput): void {
  if (!Number.isInteger(item.weekday) || item.weekday < 0 || item.weekday > 6) throw new Error('weekday must be between 0 and 6');
  if (!item.title.trim()) throw new Error('title is required');
  if (!timetableCategories.includes(item.category)) throw new Error('unknown timetable category');
  const hasPeriod = item.periodNo != null;
  const hasTimeRange = item.startTime != null || item.endTime != null;
  if (!hasPeriod && (!clockPattern.test(item.startTime ?? '') || !clockPattern.test(item.endTime ?? ''))) throw new Error('an item without a period needs start and end times');
  if (!hasPeriod && item.endTime! <= item.startTime!) throw new Error('end time must be after start time');
  if (hasPeriod && hasTimeRange) throw new Error('an item cannot have both a period and a time range');
  if (item.periodNo != null && (!Number.isInteger(item.periodNo) || item.periodNo < 1)) throw new Error('period number must be positive');
  if (item.startTime != null && !clockPattern.test(item.startTime)) throw new Error('start time must use HH:MM');
  if (item.endTime != null && !clockPattern.test(item.endTime)) throw new Error('end time must use HH:MM');
  if (!alertModes.includes(item.alertMode ?? 'none')) throw new Error('unknown alert mode');
  if (!Number.isInteger(item.alertBeforeMin ?? 0) || (item.alertBeforeMin ?? 0) < 0) throw new Error('alert lead time cannot be negative');
  if (!timetableModes.includes(item.timetableMode ?? 'regular')) throw new Error('unknown timetable mode');
}

export async function createTimetableItem(database: Pick<TimetableDatabase, 'runAsync'>, item: TimetableItemInput): Promise<void> {
  requireValidItem(item);
  await database.runAsync(
    `INSERT INTO timetable_items
      (family_id, weekday, period_no, start_time, end_time, title, category, color_key, icon_key, alert_mode, alert_before_min, timetable_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    item.familyId?.trim() || 'local-family', item.weekday, item.periodNo ?? null, item.startTime ?? null, item.endTime ?? null, item.title.trim(), item.category,
    item.colorKey, item.iconKey, item.alertMode ?? 'none', item.alertBeforeMin ?? 0, item.timetableMode ?? 'regular',
  );
}

export async function updateTimetableItem(database: Pick<TimetableDatabase, 'runAsync'>, id: number, item: TimetableItemInput): Promise<void> {
  if (!Number.isInteger(id) || id < 1) throw new Error('item id must be positive');
  requireValidItem(item);
  await database.runAsync(
    `UPDATE timetable_items SET weekday = ?, period_no = ?, start_time = ?, end_time = ?, title = ?, category = ?, color_key = ?, icon_key = ?, alert_mode = ?, alert_before_min = ?, timetable_mode = ?
     WHERE id = ? AND family_id = ? AND timetable_mode = ?`,
    item.weekday, item.periodNo ?? null, item.startTime ?? null, item.endTime ?? null, item.title.trim(), item.category, item.colorKey, item.iconKey,
    item.alertMode ?? 'none', item.alertBeforeMin ?? 0, item.timetableMode ?? 'regular', id, item.familyId?.trim() || 'local-family', item.timetableMode ?? 'regular',
  );
}

export async function deleteTimetableItem(database: Pick<TimetableDatabase, 'runAsync'>, id: number, familyId = 'local-family', timetableMode: TimetableMode = 'regular'): Promise<void> {
  if (!Number.isInteger(id) || id < 1) throw new Error('item id must be positive');
  await database.runAsync('DELETE FROM timetable_items WHERE id = ? AND family_id = ? AND timetable_mode = ?', id, familyId, timetableMode);
}

export async function copyTimetableWeekday(database: Pick<TimetableDatabase, 'execAsync' | 'getAllAsync' | 'runAsync'>, sourceWeekday: number, targetWeekday: number, familyId = 'local-family', timetableMode: TimetableMode = 'regular'): Promise<void> {
  if (!Number.isInteger(sourceWeekday) || sourceWeekday < 0 || sourceWeekday > 6 || !Number.isInteger(targetWeekday) || targetWeekday < 0 || targetWeekday > 6) throw new Error('weekday must be between 0 and 6');
  if (sourceWeekday === targetWeekday) throw new Error('source and target weekdays must differ');
  await database.execAsync('BEGIN IMMEDIATE');
  try {
    const [sourceCount] = await database.getAllAsync<{ count: number }>('SELECT COUNT(*) AS count FROM timetable_items WHERE family_id = ? AND weekday = ? AND timetable_mode = ?', familyId, sourceWeekday, timetableMode);
    if (!sourceCount?.count) throw new Error('source weekday has no items');
    await database.runAsync('DELETE FROM timetable_items WHERE family_id = ? AND weekday = ? AND timetable_mode = ?', familyId, targetWeekday, timetableMode);
    await database.runAsync(
      `INSERT INTO timetable_items (family_id, weekday, period_no, start_time, end_time, title, category, color_key, icon_key, alert_mode, alert_before_min, timetable_mode)
       SELECT family_id, ?, period_no, start_time, end_time, title, category, color_key, icon_key, alert_mode, alert_before_min, timetable_mode
       FROM timetable_items WHERE family_id = ? AND weekday = ? AND timetable_mode = ?`, targetWeekday, familyId, sourceWeekday, timetableMode,
    );
    await database.execAsync('COMMIT');
  } catch (error) { await database.execAsync('ROLLBACK'); throw error; }
}

export type TimetableItem = {
  readonly id: number;
  readonly periodNo?: number | null;
  readonly startTime: string;
  readonly endTime: string;
  readonly title: string;
  readonly colorKey: ColorKey;
  readonly iconKey: IconKey;
};

export type EditableTimetableItem = TimetableItemInput & { readonly id: number };

export async function getEditableTimetableItemById(database: Pick<TimetableDatabase, 'getFirstAsync'>, id: number, familyId = 'local-family'): Promise<EditableTimetableItem | null> {
  if (!Number.isInteger(id) || id < 1) throw new Error('item id must be positive');
  return database.getFirstAsync<EditableTimetableItem>(
    `SELECT timetable_items.id, timetable_items.weekday, timetable_items.period_no AS periodNo,
      COALESCE(periods.start_time, timetable_items.start_time) AS startTime,
      COALESCE(periods.end_time, timetable_items.end_time) AS endTime,
      timetable_items.title, timetable_items.category, timetable_items.color_key AS colorKey, timetable_items.icon_key AS iconKey,
      timetable_items.alert_mode AS alertMode, timetable_items.alert_before_min AS alertBeforeMin, timetable_items.timetable_mode AS timetableMode
    FROM timetable_items LEFT JOIN periods ON periods.family_id = timetable_items.family_id AND periods.period_no = timetable_items.period_no
    WHERE timetable_items.id = ? AND timetable_items.family_id = ?`,
    id, familyId,
  );
}

export async function getEditableTimetableItems(database: Pick<TimetableDatabase, 'getAllAsync'>, familyId = 'local-family', timetableMode: TimetableMode = 'regular'): Promise<readonly EditableTimetableItem[]> {
  return database.getAllAsync<EditableTimetableItem>(
    `SELECT id, weekday, period_no AS periodNo, start_time AS startTime, end_time AS endTime, title, category,
      color_key AS colorKey, icon_key AS iconKey, alert_mode AS alertMode, alert_before_min AS alertBeforeMin, timetable_mode AS timetableMode
    FROM timetable_items WHERE family_id = ? AND timetable_mode = ? ORDER BY weekday, COALESCE(period_no, 999), start_time, id`, familyId, timetableMode,
  );
}

export async function createTimetableItems(database: Pick<TimetableDatabase, 'execAsync' | 'runAsync'>, weekdays: readonly number[], item: Omit<TimetableItemInput, 'weekday'>): Promise<void> {
  const uniqueWeekdays = [...new Set(weekdays)];
  if (!uniqueWeekdays.length) throw new Error('at least one weekday is required');
  await database.execAsync('BEGIN IMMEDIATE');
  try {
    for (const weekday of uniqueWeekdays) await createTimetableItem(database, { ...item, weekday });
    await database.execAsync('COMMIT');
  } catch (error) { await database.execAsync('ROLLBACK'); throw error; }
}

export async function getTimetableItemsForWeekday(
  database: Pick<TimetableDatabase, 'getAllAsync'>,
  weekday: number,
  familyId = 'local-family',
  timetableMode: TimetableMode = 'regular',
): Promise<readonly TimetableItem[]> {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error('weekday must be between 0 and 6');
  return database.getAllAsync<TimetableItem>(
    `SELECT timetable_items.id, timetable_items.period_no AS periodNo, COALESCE(periods.start_time, timetable_items.start_time) AS startTime,
      COALESCE(periods.end_time, timetable_items.end_time) AS endTime, timetable_items.title,
      timetable_items.color_key AS colorKey, timetable_items.icon_key AS iconKey
    FROM timetable_items LEFT JOIN periods
      ON periods.family_id = timetable_items.family_id AND periods.period_no = timetable_items.period_no
    WHERE timetable_items.family_id = ? AND timetable_items.weekday = ? AND timetable_items.timetable_mode = ?
    ORDER BY startTime, endTime, timetable_items.id`,
    familyId, weekday, timetableMode,
  );
}

