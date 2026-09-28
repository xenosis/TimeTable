import { NativeModules } from 'react-native';

export type WidgetData = {
  readonly schemaVersion: 1;
  readonly updatedAt: string;
  readonly scheduleDate: string;
  readonly theme: { readonly background: string; readonly surface: string; readonly text: string; readonly primary: string; readonly onPrimary: string; readonly border: string };
  readonly current: { readonly title: string; readonly startTime: string } | null;
  readonly next: { readonly title: string; readonly startTime: string } | null;
  readonly schedule: readonly { readonly title: string; readonly startTime: string; readonly endTime: string }[];
};

type WidgetDataNativeModule = { writeWidgetData(payload: string): Promise<void> };

export async function writeWidgetData(data: WidgetData, nativeModule: WidgetDataNativeModule | undefined = NativeModules.WidgetDataBridge): Promise<void> {
  if (!nativeModule) throw new Error('WidgetDataBridge 네이티브 모듈을 찾을 수 없어요. 개발 빌드를 다시 설치해 주세요.');
  await nativeModule.writeWidgetData(JSON.stringify(data));
}
