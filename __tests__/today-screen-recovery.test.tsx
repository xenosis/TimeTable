import { Text } from 'react-native';
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

it('시간표 세트 최초 조회 실패를 알리고 버튼으로 재조회하여 복구한다', async () => {
  jest.mocked(getActiveTimetableSet).mockRejectedValue(new Error('temporary'));
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<TodayScreen />); });
  const copy = () => tree.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');
  expect(copy()).toContain('오늘 일정을 불러오지 못했어요.');
  jest.mocked(getActiveTimetableSet).mockResolvedValue({ id: 1, name: '평소' } as Awaited<ReturnType<typeof getActiveTimetableSet>>);
  await act(async () => { tree.root.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')[0].props.onPress(); });
  expect(copy()).not.toContain('불러오지 못했어요');
  expect(copy()).not.toContain('불러오는 중');
  act(() => tree.unmount());
});
