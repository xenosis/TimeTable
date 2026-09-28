import type { TimetableDatabase } from './types';

export type Period = { readonly periodNo: number; readonly startTime: string; readonly endTime: string };
const clockPattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function validatePeriods(periods: readonly Period[]): void {
  const numbers = new Set<number>();
  for (const period of periods) {
    if (!Number.isInteger(period.periodNo) || period.periodNo < 1 || numbers.has(period.periodNo)) throw new Error('period numbers must be unique positive integers');
    if (!clockPattern.test(period.startTime) || !clockPattern.test(period.endTime) || period.endTime <= period.startTime) throw new Error('period times must be valid and ordered');
    numbers.add(period.periodNo);
  }
}

export async function getPeriods(database: Pick<TimetableDatabase, 'getAllAsync'>, familyId = 'local-family'): Promise<readonly Period[]> {
  return database.getAllAsync<Period>('SELECT period_no AS periodNo, start_time AS startTime, end_time AS endTime FROM periods WHERE family_id = ? ORDER BY period_no', familyId);
}

export async function savePeriods(database: Pick<TimetableDatabase, 'execAsync' | 'runAsync'>, periods: readonly Period[], familyId = 'local-family'): Promise<void> {
  validatePeriods(periods);
  await database.execAsync('BEGIN IMMEDIATE');
  try {
    for (const period of periods) {
      await database.runAsync(
        `INSERT INTO periods (family_id, period_no, start_time, end_time) VALUES (?, ?, ?, ?)
         ON CONFLICT(family_id, period_no) DO UPDATE SET
           start_time = excluded.start_time,
           end_time = excluded.end_time`,
        familyId,
        period.periodNo,
        period.startTime,
        period.endTime,
      );
    }
    await database.execAsync('COMMIT');
  } catch (error) { await database.execAsync('ROLLBACK'); throw error; }
}
