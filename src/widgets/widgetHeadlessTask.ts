import { AppRegistry } from 'react-native';

import { requestWidgetRefresh } from './widgetRefresh';

/** 네이티브 `WidgetChecksHeadlessService.TASK_NAME`과 같은 이름이어야 한다. */
export const WIDGET_CHECKS_HEADLESS_TASK = 'TimeTableWidgetChecks';

/**
 * 할 일 위젯에서 누른 체크를 화면 없이 반영한다. 위젯 갱신 흐름이 대기 체크를 앱 안 체크와 같은 규칙으로 DB에 기록하고,
 * 기록한 것이 있으면 할 일 알림을 다시 예약한 뒤 위젯 데이터를 새로 쓴다.
 * 실패해도 대기 체크는 남아 앱 실행·백그라운드 작업 때 다시 시도되므로 오류는 기록만 한다.
 */
export async function applyWidgetChecksInBackground(): Promise<void> {
  try {
    await requestWidgetRefresh();
  } catch (error) {
    console.warn('TimeTable: 위젯 체크를 바로 반영하지 못했어요. 앱을 열면 다시 시도해요.', error);
  }
}

AppRegistry.registerHeadlessTask(WIDGET_CHECKS_HEADLESS_TASK, () => applyWidgetChecksInBackground);
