import { getDatabase } from '../db/database';
import { themeSelectionStore } from '../theme/selection';
import { createCoalescedRefresh } from '../utils/coalescedRefresh';
import { writeWidgetData } from './widgetDataBridge';
import { buildWidgetData } from './widgetDataV2';

async function refreshWidgetFromDatabase(): Promise<void> {
  const [database, theme] = await Promise.all([getDatabase(), themeSelectionStore.load()]);
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
