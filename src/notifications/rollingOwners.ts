import { requestRollingScheduleRefresh } from './rollingRefresh';
import { requestTaskRollingScheduleRefresh } from './taskRollingSchedule';

/** Refresh each independently-owned native generation. One owner's failure does not block the other. */
export async function refreshAllRollingOwners(): Promise<void> {
  const results = await Promise.allSettled([requestRollingScheduleRefresh(), requestTaskRollingScheduleRefresh()]);
  const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (rejected.length > 0) throw rejected[0].reason;
}
