import { writeWidgetData } from '../src/widgets/widgetDataBridge';
import type { WidgetDataV2 } from '../src/widgets/widgetDataV2';

const sample: WidgetDataV2 = {
  schemaVersion: 2,
  updatedAt: '2026-09-30T00:00:00.000Z',
  timetableName: '평소',
  theme: { background: '#FFFFFF', surface: '#FFFFFF', text: '#111111', textMuted: '#555555', primary: '#000000', onPrimary: '#FFFFFF', border: '#CCCCCC' },
  days: [{ date: '2026-09-30', weekday: 3, schedule: [{ title: '피아노', startTime: '17:10', endTime: '18:10', backgroundColor: '#DB2777', textColor: '#FFFFFF' }], tasks: [], hiddenScheduleCount: 0, hiddenTaskCount: 0 }],
};

it('serializes widget data for the native file writer', async () => {
  const writeWidgetDataNative = jest.fn<Promise<void>, [string]>().mockResolvedValue();
  await writeWidgetData(sample, { writeWidgetData: writeWidgetDataNative });
  expect(writeWidgetDataNative).toHaveBeenCalledWith(JSON.stringify(sample));
});

it('explains when the development build lacks the native bridge', async () => {
  await expect(writeWidgetData(sample, undefined)).rejects.toThrow('WidgetDataBridge');
});
