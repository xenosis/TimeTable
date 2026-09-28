import { writeWidgetData, type WidgetData } from '../src/widgets/widgetDataBridge';

const sample: WidgetData = { schemaVersion: 1, updatedAt: '2026-09-18T00:00:00.000Z', scheduleDate: '2026-09-18', theme: { background: '#FFFFFF', surface: '#FFFFFF', text: '#111111', primary: '#000000', onPrimary: '#FFFFFF', border: '#CCCCCC' }, current: { title: '국어', startTime: '09:00' }, next: null, schedule: [{ title: '국어', startTime: '09:00', endTime: '09:40' }] };

it('serializes widget data for the native file writer', async () => {
  const writeWidgetDataNative = jest.fn<Promise<void>, [string]>().mockResolvedValue();
  await writeWidgetData(sample, { writeWidgetData: writeWidgetDataNative });
  expect(writeWidgetDataNative).toHaveBeenCalledWith(JSON.stringify(sample));
});

it('explains when the development build lacks the native bridge', async () => {
  await expect(writeWidgetData(sample, undefined)).rejects.toThrow('WidgetDataBridge');
});
