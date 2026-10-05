import { AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import TodayScreen from '../app/(tabs)/index';
import { getActiveTimetableSet } from '../src/db/timetableSetRepository';

jest.mock('expo-router', () => ({ router: {}, useFocusEffect: (callback: () => void) => jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]) }));
jest.mock('../src/theme/provider', () => ({ useActiveTheme: () => ({ theme: jest.requireActual<typeof import('../src/theme')>('../src/theme').defaultTheme }) }));
jest.mock('../src/db/database', () => ({ getDatabase: jest.fn(async () => ({})) }));
jest.mock('../src/db/timetableSetRepository', () => ({ getActiveTimetableSet: jest.fn() }));
jest.mock('../src/components/CharacterHeader', () => ({ CharacterHeader: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('../src/components/PermissionGuide', () => ({ PermissionGuide: () => null }));
jest.mock('../src/components/TodayScheduleCard', () => ({ TodayScheduleCard: () => null }));
jest.mock('../src/components/TodayTasksCard', () => ({ TodayTasksCard: () => null }));
jest.mock('../src/components/GemSummaryLine', () => ({ GemSummaryLine: () => null }));
jest.mock('../src/widgets/widgetChecksSignal', () => ({ subscribeWidgetChecksApplied: () => () => undefined }));

// P4.5: 앱을 켜 둔 채 자정을 넘기거나 백그라운드에서 돌아오면 오늘 화면이 새 날짜로 다시 그려진다(실제 자정 대신 가짜 시계로 검증).
describe('오늘 화면 날짜 갱신', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 5, 23, 59, 0));
    jest.mocked(getActiveTimetableSet).mockResolvedValue({ id: 1, name: '평소' } as Awaited<ReturnType<typeof getActiveTimetableSet>>);
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it('자정이 지나면 목록을 다시 읽고 날짜 표시가 다음 날로 바뀐다', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<TodayScreen />); });
    const dateText = () => JSON.stringify(tree.toJSON());
    expect(dateText()).toContain('10월 5일');
    const before = jest.mocked(getActiveTimetableSet).mock.calls.length;
    await act(async () => { jest.advanceTimersByTime(61_000); });
    expect(dateText()).toContain('10월 6일');
    expect(jest.mocked(getActiveTimetableSet).mock.calls.length).toBeGreaterThan(before);
    act(() => tree.unmount());
  });

  it('백그라운드에서 앱이 앞으로 돌아오면 그 시점의 날짜로 다시 읽는다', async () => {
    let listener: (state: string) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => { listener = handler as (state: string) => void; return { remove: jest.fn() }; });
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<TodayScreen />); });
    const before = jest.mocked(getActiveTimetableSet).mock.calls.length;
    jest.setSystemTime(new Date(2026, 9, 7, 8, 0, 0));
    await act(async () => { listener('active'); });
    expect(JSON.stringify(tree.toJSON())).toContain('10월 7일');
    expect(jest.mocked(getActiveTimetableSet).mock.calls.length).toBeGreaterThan(before);
    act(() => tree.unmount());
  });
});
