import { getDatabase } from '../db/database';
import { getActiveTimetableSet } from '../db/timetableSetRepository';
import { createCoalescedRefresh } from '../utils/coalescedRefresh';

import { replaceTimetableRollingNotificationsFromDatabase } from './rollingSchedule';

async function refreshFromDatabase(): Promise<void> {
  const database = await getDatabase();
  const { id: setId } = await getActiveTimetableSet(database);
  await replaceTimetableRollingNotificationsFromDatabase(database, setId);
}

export const requestRollingScheduleRefresh = createCoalescedRefresh(refreshFromDatabase);
