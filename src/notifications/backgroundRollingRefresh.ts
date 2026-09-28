import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { refreshAllRollingOwners } from './rollingOwners';

export const ROLLING_REFRESH_BACKGROUND_TASK = 'timetable-rolling-refresh';
const MINIMUM_INTERVAL_MINUTES = 15;

async function refreshRollingScheduleInBackground(): Promise<BackgroundTask.BackgroundTaskResult> {
  try {
    await refreshAllRollingOwners();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
}

if (!TaskManager.isTaskDefined(ROLLING_REFRESH_BACKGROUND_TASK)) {
  TaskManager.defineTask(ROLLING_REFRESH_BACKGROUND_TASK, refreshRollingScheduleInBackground);
}

export async function registerRollingRefreshBackgroundTask(): Promise<'registered' | 'already-registered' | 'unavailable'> {
  const [taskManagerAvailable, backgroundTaskStatus] = await Promise.all([
    TaskManager.isAvailableAsync(),
    BackgroundTask.getStatusAsync(),
  ]);
  if (!taskManagerAvailable || backgroundTaskStatus !== BackgroundTask.BackgroundTaskStatus.Available) return 'unavailable';
  if (await TaskManager.isTaskRegisteredAsync(ROLLING_REFRESH_BACKGROUND_TASK)) return 'already-registered';

  await BackgroundTask.registerTaskAsync(ROLLING_REFRESH_BACKGROUND_TASK, {
    minimumInterval: MINIMUM_INTERVAL_MINUTES,
  });
  return 'registered';
}
