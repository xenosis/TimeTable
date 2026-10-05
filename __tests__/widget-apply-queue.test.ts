import { applyPendingWidgetChecks } from '../src/widgets/widgetPendingChecks';
import { applyPendingWidgetChecksNow } from '../src/widgets/widgetRefresh';

jest.mock('../src/db/database', () => ({ getDatabase: jest.fn() }));
jest.mock('../src/theme/selection', () => ({ themeSelectionStore: { load: jest.fn() } }));
jest.mock('../src/widgets/widgetDataBridge', () => ({ ackPendingWidgetChecks: jest.fn(), peekPendingWidgetChecks: jest.fn(), writeWidgetData: jest.fn() }));
jest.mock('../src/widgets/widgetChecksSignal', () => ({ notifyWidgetChecksApplied: jest.fn() }));
jest.mock('../src/widgets/widgetDataV2', () => ({ buildWidgetData: jest.fn() }));
jest.mock('../src/widgets/widgetPendingChecks', () => ({ applyPendingWidgetChecks: jest.fn() }));

it('위젯 대기 체크 반영은 겹치지 않고 차례로 실행된다(연타한 체크의 순서 보존)', async () => {
  const order: string[] = [];
  let releaseFirst!: () => void;
  jest.mocked(applyPendingWidgetChecks)
    .mockImplementationOnce(async () => { order.push('첫째 시작'); await new Promise<void>((resolve) => { releaseFirst = resolve; }); order.push('첫째 끝'); return 1; })
    .mockImplementationOnce(async () => { order.push('둘째 시작'); return 1; });
  const database = {} as Parameters<typeof applyPendingWidgetChecksNow>[0];
  const first = applyPendingWidgetChecksNow(database);
  const second = applyPendingWidgetChecksNow(database);
  await new Promise((resolve) => setImmediate(resolve));
  expect(order).toEqual(['첫째 시작']);
  releaseFirst();
  await Promise.all([first, second]);
  expect(order).toEqual(['첫째 시작', '첫째 끝', '둘째 시작']);
});

it('앞선 반영이 실패해도 다음 반영은 실행된다', async () => {
  jest.mocked(applyPendingWidgetChecks).mockRejectedValueOnce(new Error('busy')).mockResolvedValueOnce(2);
  const database = {} as Parameters<typeof applyPendingWidgetChecksNow>[0];
  await expect(applyPendingWidgetChecksNow(database)).rejects.toThrow('busy');
  await expect(applyPendingWidgetChecksNow(database)).resolves.toBe(2);
});
