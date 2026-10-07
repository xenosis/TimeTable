import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ParentStatusCard } from '../src/components/ParentStatusCard';
import { defaultTheme } from '../src/theme';
import { setSyncStatus } from '../src/sync/syncStatus';

const mockOverview = jest.fn();
const mockSync = jest.fn<Promise<boolean>, [unknown]>().mockResolvedValue(true);
jest.mock('../src/sync/syncRunner', () => ({ runSync: (target: unknown) => mockSync(target) }));
jest.mock('../src/components/parentOverview', () => ({
  loadParentOverview: (...args: unknown[]) => mockOverview(...args),
  taskProgressLine: (tasks: unknown[]) => `${tasks.length}개`,
  stickerLine: () => '보석',
  childSyncLine: () => '동기화 시각',
}));
jest.mock('../src/server/childDeviceStatus', () => ({ fetchChildDeviceStatus: async () => null }));
jest.mock('../src/sync/syncMarkers', () => ({ lastAdminEditAt: () => null, hasSyncedFamily: () => true, lastSyncedAt: () => '2026-10-07T14:00:00Z' }));
jest.mock('../src/widgets/widgetChecksSignal', () => ({ subscribeWidgetChecksApplied: () => () => undefined }));

const text = (root: ReactTestInstance) => root.findAll((node) => (node.type as unknown) === 'Text').flatMap((node) => node.children).join(' ');
let tree: ReturnType<typeof create>;
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 7, 23, 59, 30)); mockOverview.mockReset(); });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); setSyncStatus({ state: 'idle' }); jest.useRealTimers(); });

test('자정을 넘기면 오늘 할 일 목록을 다시 읽는다', async () => {
  mockOverview.mockResolvedValueOnce({ tasks: [{ id: 1 }], stickers: {} }).mockResolvedValue({ tasks: [], stickers: {} });
  await act(async () => { tree = create(<ParentStatusCard theme={defaultTheme} familyId="a" />); });
  expect(text(tree.root)).toContain('1개');
  await act(async () => { jest.advanceTimersByTime(30_050); });
  expect(mockOverview).toHaveBeenCalledTimes(2);
  expect(text(tree.root)).toContain('0개');
});

test('가족이 바뀌면 이전 가족의 조회 결과를 표시하지 않는다', async () => {
  mockOverview.mockResolvedValueOnce({ tasks: [{ id: 1 }], stickers: {} }).mockReturnValue(new Promise(() => undefined));
  await act(async () => { tree = create(<ParentStatusCard theme={defaultTheme} familyId="a" />); });
  expect(text(tree.root)).toContain('1개');
  await act(async () => { tree.update(<ParentStatusCard theme={defaultTheme} familyId="b" />); });
  expect(text(tree.root)).not.toContain('1개');
  expect(text(tree.root)).toContain('불러오는 중');
});

test('새로 보기는 서버와 맞춘 뒤 로컬 현황을 다시 읽는다', async () => {
  mockOverview.mockResolvedValue({ tasks: [], stickers: {} });
  await act(async () => { tree = create(<ParentStatusCard theme={defaultTheme} familyId="a" />); });
  await act(async () => { await tree.root.findByProps({ accessibilityLabel: '딸 현황 새로 보기' }).props.onPress(); });
  expect(mockSync).toHaveBeenCalledWith({ familyId: 'a', role: 'parent' });
  expect(mockOverview).toHaveBeenCalledTimes(2);
});

test('자동 동기화 실패를 표시하고 복구되면 안내를 지운다', async () => {
  mockOverview.mockResolvedValue({ tasks: [], stickers: {} });
  setSyncStatus({ familyId: 'a', state: 'error', message: '서버 연결 실패' });
  await act(async () => { tree = create(<ParentStatusCard theme={defaultTheme} familyId="a" />); });
  expect(text(tree.root)).toContain('서버 연결 실패');
  expect(text(tree.root)).toContain('이 폰 마지막 동기화');
  await act(async () => setSyncStatus({ familyId: 'a', state: 'idle' }));
  expect(text(tree.root)).not.toContain('서버 연결 실패');
});
