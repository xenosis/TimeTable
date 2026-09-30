import { getDatabase } from '../db/database';
import { themeSelectionStore } from '../theme/selection';
import { createCoalescedRefresh } from '../utils/coalescedRefresh';
import { ackPendingWidgetChecks, peekPendingWidgetChecks, writeWidgetData } from './widgetDataBridge';
import { notifyWidgetChecksApplied } from './widgetChecksSignal';
import { applyPendingWidgetChecks } from './widgetPendingChecks';
import { buildWidgetData } from './widgetDataV2';

async function refreshWidgetFromDatabase(): Promise<void> {
  const [database, theme] = await Promise.all([getDatabase(), themeSelectionStore.load()]);
  // 위젯에서 누른 체크를 먼저 앱 안 체크와 같은 규칙으로 DB에 기록한다. 그래야 아래에서 쓰는 위젯 데이터가 누른 결과를 되돌리지 않는다.
  const applied = await applyPendingWidgetChecks(database, peekPendingWidgetChecks, ackPendingWidgetChecks);
  if (applied > 0) {
    notifyWidgetChecksApplied(); // 열려 있는 오늘 화면이 완료 상태와 보석을 다시 읽게 한다
    // 끝낸 할 일의 재알림이 더 울리지 않게 할 일 알림도 다시 예약한다(앱 안 체크와 같다).
    // 할 일 예약 모듈은 이 파일을 불러오는 쪽이므로 순환을 피하려고 필요할 때만 불러온다(Metro와 Jest 모두 동작하는 지연 require).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { replaceRollingNotificationsFromDatabase } = require('../notifications/taskRollingSchedule') as typeof import('../notifications/taskRollingSchedule');
    await replaceRollingNotificationsFromDatabase(database).catch((error: unknown) => console.warn('TimeTable: 위젯 체크 뒤 할 일 알림을 다시 예약하지 못했어요.', error));
  }
  await writeWidgetData(await buildWidgetData(database, theme, new Date()));
}

/**
 * 적용 중인 시간표의 오늘부터 7일치를 위젯 파일에 다시 쓴다. 화면(React)에 의존하지 않아 백그라운드 작업에서도 동작한다.
 * 동시에 여러 번 불려도 실행 중인 것이 끝난 뒤 한 번 더 돌아 항상 마지막 상태를 반영한다.
 */
export const requestWidgetRefresh = createCoalescedRefresh(refreshWidgetFromDatabase);

/** 알림 재예약 흐름에 덧붙여 부르는 용도: 위젯 갱신이 실패해도 알림 재예약 결과를 망치지 않도록 실패는 기록만 한다. */
export async function refreshWidgetQuietly(): Promise<void> {
  try {
    await requestWidgetRefresh();
  } catch (error) {
    console.warn('TimeTable: 위젯 데이터를 다시 쓰지 못했어요.', error);
  }
}
