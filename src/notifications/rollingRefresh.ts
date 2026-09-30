import { getDatabase } from '../db/database';
import { getActiveTimetableSet } from '../db/timetableSetRepository';
import { createCoalescedRefresh } from '../utils/coalescedRefresh';
import { refreshWidgetQuietly } from '../widgets/widgetRefresh';

import { replaceTimetableRollingNotificationsFromDatabase } from './rollingSchedule';

async function refreshFromDatabase(): Promise<void> {
  const database = await getDatabase();
  const { id: setId } = await getActiveTimetableSet(database);
  try {
    await replaceTimetableRollingNotificationsFromDatabase(database, setId);
  } finally {
    // 시간표가 바뀌는 모든 경로가 이 재예약을 거치므로 위젯도 여기서 함께 갱신한다(앱 시작·복귀·백그라운드·저장·시간표 적용).
    // 위젯은 알림 권한과 무관하므로 알림 예약이 실패(권한 부족 등)해도 갱신한다.
    await refreshWidgetQuietly();
  }
}

export const requestRollingScheduleRefresh = createCoalescedRefresh(refreshFromDatabase);
