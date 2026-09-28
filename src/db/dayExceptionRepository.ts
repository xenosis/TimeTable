import type { DayException } from '../utils/rollingNotifications';
import type { TimetableDatabase } from './types';

export async function getDayExceptionsInRange(database: Pick<TimetableDatabase, 'getAllAsync'>, startDate: string, endDate: string, familyId = 'local-family'): Promise<readonly DayException[]> {
  return database.getAllAsync<DayException>(
    `SELECT start_date AS startDate, end_date AS endDate
     FROM day_exceptions
     WHERE family_id = ? AND start_date <= ? AND end_date >= ?
     ORDER BY start_date, end_date, id`, familyId, endDate, startDate,
  );
}
