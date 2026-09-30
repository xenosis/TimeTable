import { NativeModules } from 'react-native';

import type { WidgetDataV2 } from './widgetDataV2';

type WidgetDataNativeModule = {
  writeWidgetData(payload: string): Promise<void>;
  peekPendingChecks?(): Promise<string>;
  ackPendingChecks?(applied: string): Promise<void>;
};

/** 위젯이 읽는 파일에 데이터를 쓴다. 저장 직후 네이티브 쪽이 위젯을 다시 그리고 다음 갱신 알람도 예약한다. */
export async function writeWidgetData(data: WidgetDataV2, nativeModule: WidgetDataNativeModule | undefined = NativeModules.WidgetDataBridge): Promise<void> {
  if (!nativeModule) throw new Error('WidgetDataBridge 네이티브 모듈을 찾을 수 없어요. 개발 빌드를 다시 설치해 주세요.');
  await nativeModule.writeWidgetData(JSON.stringify(data));
}

/**
 * 위젯에서 누른 체크(JSON)를 읽는다. 읽기만 하고 지우지 않는다: DB에 기록하기 전에 앱이 죽어도 체크가 사라지지 않게,
 * 기록에 성공한 것만 [ackPendingWidgetChecks]로 지운다. 네이티브 모듈이 없거나 이전 빌드라 기능이 없으면 빈 목록처럼 동작한다.
 */
export async function peekPendingWidgetChecks(nativeModule: WidgetDataNativeModule | undefined = NativeModules.WidgetDataBridge): Promise<string> {
  if (!nativeModule?.peekPendingChecks) return '[]';
  return nativeModule.peekPendingChecks();
}

/** DB에 기록한 체크(JSON 배열)만 대기 목록에서 지운다. 그 사이 새로 눌린 체크는 남는다. */
export async function ackPendingWidgetChecks(applied: string, nativeModule: WidgetDataNativeModule | undefined = NativeModules.WidgetDataBridge): Promise<void> {
  if (!nativeModule?.ackPendingChecks) return;
  await nativeModule.ackPendingChecks(applied);
}
