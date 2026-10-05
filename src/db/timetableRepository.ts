import { alertModes, timetableCategories, type TimetableCategory, type TimetableDatabase, type TimetableItemInput, type TimetableSetId } from './types';
import type { ColorKey, IconKey } from '../theme';

const clockPattern = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 메모 최대 길이(글자 수). 이모지도 한 글자로 센다 */
export const MAX_MEMO_LENGTH = 100;

function cleanMemo(memo: string | undefined): string {
  return (memo ?? '').trim();
}

function requireValidItem(item: TimetableItemInput): void {
  if (!Number.isInteger(item.weekday) || item.weekday < 0 || item.weekday > 6) throw new Error('요일을 다시 선택해 주세요.');
  if (!item.title.trim()) throw new Error('과목 또는 일정 이름을 입력해 주세요.');
  if (!timetableCategories.includes(item.category)) throw new Error('종류를 다시 선택해 주세요.');
  const hasPeriod = item.periodNo != null;
  const hasTimeRange = item.startTime != null || item.endTime != null;
  if (!hasPeriod && (!clockPattern.test(item.startTime ?? '') || !clockPattern.test(item.endTime ?? ''))) throw new Error('시작·종료 시간을 HH:MM으로 입력해 주세요.');
  if (!hasPeriod && item.endTime! <= item.startTime!) throw new Error('종료 시간은 시작 시간보다 늦어야 해요.');
  if (hasPeriod && hasTimeRange) throw new Error('교시와 직접 입력 시간 중 하나만 정해 주세요.');
  if (item.periodNo != null && (!Number.isInteger(item.periodNo) || item.periodNo < 1)) throw new Error('교시를 다시 선택해 주세요.');
  if (item.startTime != null && !clockPattern.test(item.startTime)) throw new Error('시작 시간은 HH:MM으로 입력해 주세요.');
  if (item.endTime != null && !clockPattern.test(item.endTime)) throw new Error('종료 시간은 HH:MM으로 입력해 주세요.');
  if (!alertModes.includes(item.alertMode ?? 'none')) throw new Error('알림 방식을 다시 선택해 주세요.');
  if (!Number.isInteger(item.alertBeforeMin ?? 0) || (item.alertBeforeMin ?? 0) < 0) throw new Error('미리 알림 분은 0 이상의 숫자로 입력해 주세요.');
  if (!Number.isInteger(item.setId) || item.setId < 1) throw new Error('시간표를 다시 선택해 주세요.');
  if (Array.from(cleanMemo(item.memo)).length > MAX_MEMO_LENGTH) throw new Error(`메모는 ${MAX_MEMO_LENGTH}글자까지 쓸 수 있어요.`);
}

export async function createTimetableItem(database: Pick<TimetableDatabase, 'runAsync'>, item: TimetableItemInput): Promise<void> {
  requireValidItem(item);
  await database.runAsync(
    `INSERT INTO timetable_items
      (family_id, weekday, period_no, start_time, end_time, title, category, color_key, icon_key, alert_mode, alert_before_min, memo, set_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    item.familyId?.trim() || 'local-family', item.weekday, item.periodNo ?? null, item.startTime ?? null, item.endTime ?? null, item.title.trim(), item.category,
    item.colorKey, item.iconKey, item.alertMode ?? 'none', item.alertBeforeMin ?? 0, cleanMemo(item.memo), item.setId,
  );
}

/** memo를 넘기지 않으면(undefined) 기존 메모를 그대로 두고, 빈 문자열을 넘기면 메모를 지운다. */
export async function updateTimetableItem(database: Pick<TimetableDatabase, 'runAsync'>, id: number, item: TimetableItemInput): Promise<void> {
  if (!Number.isInteger(id) || id < 1) throw new Error('항목이 이미 변경되었거나 없어요.');
  requireValidItem(item);
  await database.runAsync(
    `UPDATE timetable_items SET weekday = ?, period_no = ?, start_time = ?, end_time = ?, title = ?, category = ?, color_key = ?, icon_key = ?, alert_mode = ?, alert_before_min = ?, memo = COALESCE(?, memo), set_id = ?
     WHERE id = ? AND family_id = ? AND set_id = ?`,
    item.weekday, item.periodNo ?? null, item.startTime ?? null, item.endTime ?? null, item.title.trim(), item.category, item.colorKey, item.iconKey,
    item.alertMode ?? 'none', item.alertBeforeMin ?? 0, item.memo === undefined ? null : cleanMemo(item.memo), item.setId, id, item.familyId?.trim() || 'local-family', item.setId,
  );
}

export async function deleteTimetableItem(database: Pick<TimetableDatabase, 'runAsync'>, id: number, setId: TimetableSetId, familyId = 'local-family'): Promise<void> {
  if (!Number.isInteger(id) || id < 1) throw new Error('항목이 이미 변경되었거나 없어요.');
  await database.runAsync('DELETE FROM timetable_items WHERE id = ? AND family_id = ? AND set_id = ?', id, familyId, setId);
}

export async function copyTimetableWeekday(database: Pick<TimetableDatabase, 'execAsync' | 'getAllAsync' | 'runAsync'>, sourceWeekday: number, targetWeekday: number, setId: TimetableSetId, familyId = 'local-family'): Promise<void> {
  if (!Number.isInteger(sourceWeekday) || sourceWeekday < 0 || sourceWeekday > 6 || !Number.isInteger(targetWeekday) || targetWeekday < 0 || targetWeekday > 6) throw new Error('요일을 다시 선택해 주세요.');
  if (sourceWeekday === targetWeekday) throw new Error('복사할 요일과 대상 요일을 다르게 골라 주세요.');
  await database.execAsync('BEGIN IMMEDIATE');
  try {
    const [sourceCount] = await database.getAllAsync<{ count: number }>('SELECT COUNT(*) AS count FROM timetable_items WHERE family_id = ? AND weekday = ? AND set_id = ?', familyId, sourceWeekday, setId);
    if (!sourceCount?.count) throw new Error('복사할 요일에 항목이 없어요.');
    await database.runAsync('DELETE FROM timetable_items WHERE family_id = ? AND weekday = ? AND set_id = ?', familyId, targetWeekday, setId);
    await database.runAsync(
      `INSERT INTO timetable_items (family_id, weekday, period_no, start_time, end_time, title, category, color_key, icon_key, alert_mode, alert_before_min, memo, set_id)
       SELECT family_id, ?, period_no, start_time, end_time, title, category, color_key, icon_key, alert_mode, alert_before_min, memo, set_id
       FROM timetable_items WHERE family_id = ? AND weekday = ? AND set_id = ?`, targetWeekday, familyId, sourceWeekday, setId,
    );
    await database.execAsync('COMMIT');
  } catch (error) { await database.execAsync('ROLLBACK'); throw error; }
}

export type TimetableItem = {
  readonly id: number;
  readonly periodNo?: number | null;
  /** 일정 종류(학교·학원·생활). 위젯은 정규 수업(학교)을 뺀다. */
  readonly category: TimetableCategory;
  readonly startTime: string;
  readonly endTime: string;
  readonly title: string;
  readonly colorKey: ColorKey;
  readonly iconKey: IconKey;
  /** 짧은 한 줄 메모. 비어 있으면 빈 문자열 */
  readonly memo?: string;
};

export type EditableTimetableItem = TimetableItemInput & { readonly id: number };

export async function getEditableTimetableItemById(database: Pick<TimetableDatabase, 'getFirstAsync'>, id: number, familyId = 'local-family'): Promise<EditableTimetableItem | null> {
  if (!Number.isInteger(id) || id < 1) throw new Error('항목이 이미 변경되었거나 없어요.');
  return database.getFirstAsync<EditableTimetableItem>(
    `SELECT timetable_items.id, timetable_items.weekday, timetable_items.period_no AS periodNo,
      COALESCE(periods.start_time, timetable_items.start_time) AS startTime,
      COALESCE(periods.end_time, timetable_items.end_time) AS endTime,
      timetable_items.title, timetable_items.category, timetable_items.color_key AS colorKey, timetable_items.icon_key AS iconKey,
      timetable_items.alert_mode AS alertMode, timetable_items.alert_before_min AS alertBeforeMin, timetable_items.memo, timetable_items.set_id AS setId
    FROM timetable_items LEFT JOIN periods ON periods.family_id = timetable_items.family_id AND periods.period_no = timetable_items.period_no
    WHERE timetable_items.id = ? AND timetable_items.family_id = ?`,
    id, familyId,
  );
}

export async function getEditableTimetableItems(database: Pick<TimetableDatabase, 'getAllAsync'>, setId: TimetableSetId, familyId = 'local-family'): Promise<readonly EditableTimetableItem[]> {
  return database.getAllAsync<EditableTimetableItem>(
    `SELECT id, weekday, period_no AS periodNo, start_time AS startTime, end_time AS endTime, title, category,
      color_key AS colorKey, icon_key AS iconKey, alert_mode AS alertMode, alert_before_min AS alertBeforeMin, memo, set_id AS setId
    FROM timetable_items WHERE family_id = ? AND set_id = ? ORDER BY weekday, COALESCE(period_no, 999), start_time, id`, familyId, setId,
  );
}

export async function createTimetableItems(database: Pick<TimetableDatabase, 'execAsync' | 'runAsync'>, weekdays: readonly number[], item: Omit<TimetableItemInput, 'weekday'>): Promise<void> {
  const uniqueWeekdays = [...new Set(weekdays)];
  if (!uniqueWeekdays.length) throw new Error('반복 요일을 하나 이상 선택해 주세요.');
  await database.execAsync('BEGIN IMMEDIATE');
  try {
    for (const weekday of uniqueWeekdays) await createTimetableItem(database, { ...item, weekday });
    await database.execAsync('COMMIT');
  } catch (error) { await database.execAsync('ROLLBACK'); throw error; }
}

export async function getTimetableItemsForWeekday(
  database: Pick<TimetableDatabase, 'getAllAsync'>,
  weekday: number,
  setId: TimetableSetId,
  familyId = 'local-family',
): Promise<readonly TimetableItem[]> {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error('요일을 다시 선택해 주세요.');
  return database.getAllAsync<TimetableItem>(
    `SELECT timetable_items.id, timetable_items.period_no AS periodNo, COALESCE(periods.start_time, timetable_items.start_time) AS startTime,
      COALESCE(periods.end_time, timetable_items.end_time) AS endTime, timetable_items.title, timetable_items.category,
      timetable_items.color_key AS colorKey, timetable_items.icon_key AS iconKey, timetable_items.memo
    FROM timetable_items LEFT JOIN periods
      ON periods.family_id = timetable_items.family_id AND periods.period_no = timetable_items.period_no
    WHERE timetable_items.family_id = ? AND timetable_items.weekday = ? AND timetable_items.set_id = ?
    ORDER BY startTime, endTime, timetable_items.id`,
    familyId, weekday, setId,
  );
}

