import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { refreshSchoolTimetableIfDue } from '../neis/schoolAutoRefresh';
import { syncFamilyInBackground } from '../sync/backgroundSync';
import { refreshAllRollingOwners } from './rollingOwners';

export const ROLLING_REFRESH_BACKGROUND_TASK = 'timetable-rolling-refresh';
const MINIMUM_INTERVAL_MINUTES = 15;

async function refreshRollingScheduleInBackground(): Promise<BackgroundTask.BackgroundTaskResult> {
  try {
    // 끝나지 않는 서버 쓰기 요청도 기존 로컬 예약의 갱신을 막지 않도록 먼저 실행한다.
    const localRefreshed = await refreshAllRollingOwners().then(() => true, () => false);
    // 예약 권한이 없어도 서버 데이터는 받는다. 실패는 작업 결과에 반영한다.
    const synced = await syncFamilyInBackground().catch(() => false);
    // 학교 시간표 자동 갱신(P8.7)도 함께 확인한다. 앱이 살아 있으면 돌고, 화면 없이 깨어난 실행이면 스스로 건너뛴다(실패해도 알림 예약은 계속)
    await refreshSchoolTimetableIfDue().catch(() => null);
    await refreshAllRollingOwners();
    return synced && localRefreshed ? BackgroundTask.BackgroundTaskResult.Success : BackgroundTask.BackgroundTaskResult.Failed;
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
