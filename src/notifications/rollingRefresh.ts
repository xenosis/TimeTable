import { getDatabase } from '../db/database';
import { getActiveTimetableMode } from '../db/timetableModeRepository';
import { createCoalescedRefresh } from '../utils/coalescedRefresh';

import { replaceTimetableRollingNotificationsFromDatabase } from './rollingSchedule';

async function refreshFromDatabase(): Promise<void> {
  const database = await getDatabase();
  const timetableMode = await getActiveTimetableMode(database);
  await replaceTimetableRollingNotificationsFromDatabase(database, new Date(), 'local-family', timetableMode);
}

export const requestRollingScheduleRefresh = createCoalescedRefresh(refreshFromDatabase);
