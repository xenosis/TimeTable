import type { DayException } from '../utils/rollingNotifications';
import type { TimetableDatabase } from './types';

/** 나이스 학사일정에서 자동으로 넣은 휴일의 메모 머리말. 이 표시가 있는 휴일만 자동 갱신이 고치고 지운다(아빠가 직접 넣은 휴일은 그대로). */
export const NEIS_HOLIDAY_PREFIX = '나이스: ';

export async function getDayExceptionsInRange(database: Pick<TimetableDatabase, 'getAllAsync'>, startDate: string, endDate: string, familyId = 'local-family'): Promise<readonly DayException[]> {
  return database.getAllAsync<DayException>(
    `SELECT start_date AS startDate, end_date AS endDate, type
     FROM day_exceptions
     WHERE family_id = ? AND start_date <= ? AND end_date >= ?
     ORDER BY start_date, end_date, id`, familyId, endDate, startDate,
  );
}

/** 그날이 쉬는 날(휴일)이면 보여 줄 이름(예: '한글날', 없으면 '쉬는 날'), 아니면 null. P8.8: 쉬는 날에는 그날 일정을 통째로 비운다. */
export async function getHolidayName(database: Pick<TimetableDatabase, 'getFirstAsync'>, date: string, familyId = 'local-family'): Promise<string | null> {
  const row = await database.getFirstAsync<{ note: string }>(
    "SELECT note FROM day_exceptions WHERE family_id = ? AND type = 'holiday' AND start_date <= ? AND end_date >= ? ORDER BY id LIMIT 1", familyId, date, date,
  );
  if (!row) return null;
  return row.note.replace(NEIS_HOLIDAY_PREFIX, '').trim() || '쉬는 날';
}

/**
 * 기간(from~to, YYYY-MM-DD) 안의 나이스 자동 휴일을 holidays(날짜 → 이름)와 같게 맞춘다. 바뀐 게 있으면 true(dryRun이면 바꾸지 않고 바꿀 게 있는지만 본다).
 * 아빠가 직접 넣은 휴일(머리말 없음)은 건드리지 않는다. 로그인한 폰에서는 호출하는 쪽이 runAdminEdit로 감싸 서버에 먼저 저장한다.
 */
export async function replaceNeisHolidays(database: Pick<TimetableDatabase, 'getAllAsync' | 'runAsync'>, from: string, to: string, holidays: ReadonlyMap<string, string>, options: { readonly dryRun?: boolean } = {}): Promise<boolean> {
  const existing = await database.getAllAsync<{ id: number; date: string; note: string }>(
    "SELECT id, start_date AS date, note FROM day_exceptions WHERE family_id = 'local-family' AND type = 'holiday' AND substr(note, 1, ?) = ? AND start_date >= ? AND start_date <= ?",
    NEIS_HOLIDAY_PREFIX.length, NEIS_HOLIDAY_PREFIX, from, to,
  );
  let changed = false;
  for (const row of existing) {
    if (holidays.get(row.date) !== undefined && `${NEIS_HOLIDAY_PREFIX}${holidays.get(row.date)}` === row.note) continue;
    if (options.dryRun) return true;
    await database.runAsync('DELETE FROM day_exceptions WHERE id = ?', row.id);
    changed = true;
  }
  const kept = new Set(existing.filter((row) => `${NEIS_HOLIDAY_PREFIX}${holidays.get(row.date)}` === row.note).map((row) => row.date));
  for (const [date, name] of holidays) {
    if (kept.has(date) || date < from || date > to) continue;
    if (options.dryRun) return true;
    await database.runAsync("INSERT INTO day_exceptions (family_id, start_date, end_date, type, note) VALUES ('local-family', ?, ?, 'holiday', ?)", date, date, `${NEIS_HOLIDAY_PREFIX}${name}`);
    changed = true;
  }
  return changed;
}
