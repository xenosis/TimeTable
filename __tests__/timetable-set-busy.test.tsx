import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TimetableSetPanel } from '../src/components/TimetableSetPanel';
import { getDatabase } from '../src/db/database';
import { setActiveTimetableSet } from '../src/db/timetableSetRepository';
import { requestRollingScheduleRefresh } from '../src/notifications/rollingRefresh';
import { defaultTheme } from '../src/theme';

jest.mock('../src/db/database', () => ({ getDatabase: jest.fn() }));
jest.mock('../src/db/timetableSetRepository', () => ({
  maxTimetableSetNameLength: 30,
  listTimetableSets: jest.fn(async () => [{ id: 1, name: '평소', itemCount: 4 }, { id: 2, name: '방학', itemCount: 0 }]),
  setActiveTimetableSet: jest.fn(), createTimetableSet: jest.fn(), renameTimetableSet: jest.fn(), deleteTimetableSet: jest.fn(),
}));
jest.mock('../src/notifications/rollingRefresh', () => ({ requestRollingScheduleRefresh: jest.fn() }));
jest.mock('../src/widgets/widgetRefresh', () => ({ refreshWidgetQuietly: jest.fn() }));

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('시간표 세트 처리 상태 전달', () => {
  let tree: ReactTestRenderer;
  const press = (label: string) => tree.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0].props.onPress();
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getDatabase).mockResolvedValue({} as Awaited<ReturnType<typeof getDatabase>>);
    jest.mocked(requestRollingScheduleRefresh).mockResolvedValue(undefined);
  });
  afterEach(() => { act(() => tree.unmount()); });

  async function render() {
    const onBusyChange = jest.fn();
    const onApplied = jest.fn();
    await act(async () => {
      tree = create(<TimetableSetPanel theme={defaultTheme} activeSet={{ id: 1, name: '평소' }} refreshKey={0} onApplied={onApplied} onRenamed={jest.fn()} onBusyChange={onBusyChange} />);
    });
    act(() => { press('시간표 평소, 바꾸려면 누르기'); });
    return { onBusyChange, onApplied };
  }

  it('DB 적용부터 알림 재예약까지 부모에 처리 중 상태를 유지하고 완료 뒤 해제한다', async () => {
    const write = deferred();
    const refresh = deferred();
    jest.mocked(setActiveTimetableSet).mockImplementation(() => write.promise);
    jest.mocked(requestRollingScheduleRefresh).mockImplementation(() => refresh.promise);
    const { onBusyChange, onApplied } = await render();
    await act(async () => { press('방학 시간표로 바꾸기'); });
    expect(onBusyChange.mock.calls).toEqual([[true]]);
    expect(onApplied).not.toHaveBeenCalled();
    await act(async () => { write.resolve(); });
    expect(onApplied).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
    expect(onBusyChange.mock.calls).toEqual([[true]]);
    await act(async () => { refresh.resolve(); });
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it('DB 적용이 실패해도 처리 중 상태를 해제하고 기존 세트를 유지한다', async () => {
    const write = deferred();
    jest.mocked(setActiveTimetableSet).mockImplementation(() => write.promise);
    const { onBusyChange, onApplied } = await render();
    await act(async () => { press('방학 시간표로 바꾸기'); });
    await act(async () => { write.reject(new Error('write failed')); });
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
    expect(onApplied).not.toHaveBeenCalled();
    expect(requestRollingScheduleRefresh).not.toHaveBeenCalled();
  });
});
