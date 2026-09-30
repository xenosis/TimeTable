import { NativeModules } from 'react-native';

import type { WidgetDataV2 } from './widgetDataV2';

type WidgetDataNativeModule = { writeWidgetData(payload: string): Promise<void> };

/** 위젯이 읽는 파일에 데이터를 쓴다. 저장 직후 네이티브 쪽이 위젯을 다시 그리고 다음 갱신 알람도 예약한다. */
export async function writeWidgetData(data: WidgetDataV2, nativeModule: WidgetDataNativeModule | undefined = NativeModules.WidgetDataBridge): Promise<void> {
  if (!nativeModule) throw new Error('WidgetDataBridge 네이티브 모듈을 찾을 수 없어요. 개발 빌드를 다시 설치해 주세요.');
  await nativeModule.writeWidgetData(JSON.stringify(data));
}
