import type { TimetableDatabase, TimetableSet, TimetableSetId } from './types';

type ReadDb = Pick<TimetableDatabase, 'getAllAsync' | 'getFirstAsync'>;
type WriteDb = Pick<TimetableDatabase, 'execAsync' | 'getAllAsync' | 'getFirstAsync' | 'runAsync'>;

export type TimetableSetSummary = TimetableSet & { readonly itemCount: number };

export const defaultTimetableSetName = '평소';
export const maxTimetableSetNameLength = 20;

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('시간표 이름을 입력해 주세요.');
  if (trimmed.length > maxTimetableSetNameLength) throw new Error(`시간표 이름은 ${maxTimetableSetNameLength}자까지 쓸 수 있어요.`);
  return trimmed;
}

function requireSetId(setId: TimetableSetId): void {
  if (!Number.isInteger(setId) || setId < 1) throw new Error('set id must be positive');
}

export async function listTimetableSets(database: ReadDb, familyId = 'local-family'): Promise<readonly TimetableSetSummary[]> {
  return database.getAllAsync<TimetableSetSummary>(
    `SELECT timetable_sets.id AS id, timetable_sets.name AS name, COUNT(timetable_items.id) AS itemCount
     FROM timetable_sets LEFT JOIN timetable_items ON timetable_items.set_id = timetable_sets.id
     WHERE timetable_sets.family_id = ? GROUP BY timetable_sets.id ORDER BY timetable_sets.id`, familyId,
  );
}

async function findSet(database: Pick<TimetableDatabase, 'getFirstAsync'>, setId: TimetableSetId, familyId: string): Promise<TimetableSet | null> {
  return database.getFirstAsync<TimetableSet>('SELECT id, name FROM timetable_sets WHERE id = ? AND family_id = ?', setId, familyId);
}

async function insertSet(database: Pick<TimetableDatabase, 'getFirstAsync' | 'runAsync'>, name: string, familyId: string): Promise<TimetableSetId> {
  try {
    await database.runAsync('INSERT INTO timetable_sets (family_id, name) VALUES (?, ?)', familyId, name);
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new Error('같은 이름의 시간표가 이미 있어요.');
    throw error;
  }
  const row = await database.getFirstAsync<{ id: number }>('SELECT id FROM timetable_sets WHERE family_id = ? AND name = ?', familyId, name);
  if (!row) throw new Error('시간표를 만들지 못했어요.');
  return row.id;
}

/** 지금 적용 중인 시간표. 적용 기록이 없거나 지워졌으면 가장 먼저 만든 시간표를 쓰고, 하나도 없으면 '평소'를 만든다. */
export async function getActiveTimetableSet(database: WriteDb, familyId = 'local-family'): Promise<TimetableSet> {
  const active = await database.getFirstAsync<TimetableSet>(
    `SELECT timetable_sets.id AS id, timetable_sets.name AS name FROM timetable_settings
     JOIN timetable_sets ON timetable_sets.id = timetable_settings.active_set_id AND timetable_sets.family_id = timetable_settings.family_id
     WHERE timetable_settings.family_id = ?`, familyId,
  );
  if (active) return active;
  // 세트가 하나도 없으면 '평소'를 만든다. 화면 두 곳이 동시에 불러도 이름 충돌로 실패하지 않게 INSERT OR IGNORE를 쓴다.
  await database.runAsync('INSERT OR IGNORE INTO timetable_sets (family_id, name) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM timetable_sets WHERE family_id = ?)', familyId, defaultTimetableSetName, familyId);
  const fallback = await database.getFirstAsync<TimetableSet>('SELECT id, name FROM timetable_sets WHERE family_id = ? ORDER BY id LIMIT 1', familyId);
  if (!fallback) throw new Error('시간표를 준비하지 못했어요.');
  await setActiveTimetableSet(database, fallback.id, familyId);
  return fallback;
}

export async function setActiveTimetableSet(database: Pick<TimetableDatabase, 'getFirstAsync' | 'runAsync'>, setId: TimetableSetId, familyId = 'local-family'): Promise<void> {
  requireSetId(setId);
  if (!(await findSet(database, setId, familyId))) throw new Error('없는 시간표예요.');
  await database.runAsync(
    "INSERT INTO timetable_settings (family_id, active_mode, active_set_id) VALUES (?, 'regular', ?) ON CONFLICT(family_id) DO UPDATE SET active_set_id = excluded.active_set_id",
    familyId, setId,
  );
}

/** 새 시간표를 만든다. copyFromSetId를 주면 그 시간표의 항목을 그대로 복사해서 시작한다. */
export async function createTimetableSet(database: WriteDb, name: string, options: { readonly copyFromSetId?: TimetableSetId } = {}, familyId = 'local-family'): Promise<TimetableSetId> {
  const cleanName = normalizeName(name);
  const { copyFromSetId } = options;
  if (copyFromSetId != null) requireSetId(copyFromSetId);
  await database.execAsync('BEGIN IMMEDIATE');
  try {
    if (copyFromSetId != null && !(await findSet(database, copyFromSetId, familyId))) throw new Error('복사할 시간표가 없어요.');
    const newId = await insertSet(database, cleanName, familyId);
    if (copyFromSetId != null) {
      await database.runAsync(
        `INSERT INTO timetable_items (family_id, weekday, period_no, start_time, end_time, title, category, color_key, icon_key, alert_mode, alert_before_min, memo, set_id)
         SELECT family_id, weekday, period_no, start_time, end_time, title, category, color_key, icon_key, alert_mode, alert_before_min, memo, ?
         FROM timetable_items WHERE family_id = ? AND set_id = ?`, newId, familyId, copyFromSetId,
      );
    }
    await database.execAsync('COMMIT');
    return newId;
  } catch (error) { await database.execAsync('ROLLBACK'); throw error; }
}

export async function renameTimetableSet(database: Pick<TimetableDatabase, 'getFirstAsync' | 'runAsync'>, setId: TimetableSetId, name: string, familyId = 'local-family'): Promise<void> {
  requireSetId(setId);
  const cleanName = normalizeName(name);
  if (!(await findSet(database, setId, familyId))) throw new Error('없는 시간표예요.');
  try {
    await database.runAsync('UPDATE timetable_sets SET name = ? WHERE id = ? AND family_id = ?', cleanName, setId, familyId);
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new Error('같은 이름의 시간표가 이미 있어요.');
    throw error;
  }
}

/** 시간표와 그 항목을 지운다. 적용 중인 시간표나 마지막 하나 남은 시간표는 지울 수 없다. 확인과 삭제를 한 트랜잭션에서 한다. */
export async function deleteTimetableSet(database: WriteDb, setId: TimetableSetId, familyId = 'local-family'): Promise<void> {
  requireSetId(setId);
  await getActiveTimetableSet(database, familyId); // 적용 기록이 비어 있으면 먼저 복구해 둔다
  await database.execAsync('BEGIN IMMEDIATE');
  try {
    if (!(await findSet(database, setId, familyId))) throw new Error('없는 시간표예요.');
    const active = await database.getFirstAsync<{ activeSetId: number | null }>('SELECT active_set_id AS activeSetId FROM timetable_settings WHERE family_id = ?', familyId);
    if (active?.activeSetId === setId) throw new Error('지금 쓰는 시간표는 지울 수 없어요. 다른 시간표를 먼저 적용해 주세요.');
    await database.runAsync('DELETE FROM timetable_items WHERE family_id = ? AND set_id = ?', familyId, setId);
    await database.runAsync('DELETE FROM timetable_sets WHERE id = ? AND family_id = ?', setId, familyId);
    await database.execAsync('COMMIT');
  } catch (error) { await database.execAsync('ROLLBACK'); throw error; }
}
