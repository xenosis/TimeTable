import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import TodayScreen from '../app/(tabs)/index';
import { getTodayTasks, type TodayTask } from '../src/db/taskRepository';
import { setTaskCompletionWithRewards } from '../src/db/rewardRepository';

jest.mock('expo-router', () => ({ router: {}, useFocusEffect: (callback: () => void) => jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]) }));
jest.mock('../src/theme/provider', () => ({ useActiveTheme: () => ({ theme: jest.requireActual<typeof import('../src/theme')>('../src/theme').defaultTheme }) }));
jest.mock('../src/db/database', () => ({ getDatabase: jest.fn(async () => ({})) }));
jest.mock('../src/db/timetableSetRepository', () => ({ getActiveTimetableSet: jest.fn(async () => ({ id: 1, name: '평소' })) }));
jest.mock('../src/db/timetableRepository', () => ({ getTimetableItemsForWeekday: jest.fn(async () => []) }));
jest.mock('../src/db/taskRepository', () => ({ getTodayTasks: jest.fn() }));
jest.mock('../src/db/rewardRepository', () => ({ setTaskCompletionWithRewards: jest.fn() }));
jest.mock('../src/notifications/taskRollingSchedule', () => ({ requestTaskRollingScheduleRefresh: jest.fn(async () => undefined) }));
jest.mock('../src/components/CharacterHeader', () => ({ CharacterHeader: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('../src/components/PermissionGuide', () => ({ PermissionGuide: () => null }));
jest.mock('../src/widgets/widgetChecksSignal', () => ({ subscribeWidgetChecksApplied: () => () => undefined }));

it('실제 오늘 화면 카드 조합에서 체크·취소 후 진행률과 체크가 복구되고 완료 칭찬을 유지한다', async () => {
  jest.useFakeTimers();
  let tree!: ReactTestRenderer;
  let completed = false;
  jest.mocked(getTodayTasks).mockImplementation(async () => [{ id: 1, title: '책 읽기', completed }] as unknown as readonly TodayTask[]);
  jest.mocked(setTaskCompletionWithRewards).mockImplementation(async (_db, _id, _date, _weekday, value) => { completed = value; return null; });
  try {
    await act(async () => { tree = create(<TodayScreen />); });
    const checks = () => tree.root.findAll((node) => node.props.accessibilityRole === 'checkbox' && typeof node.props.onPress === 'function');
    const text = () => tree.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');
    const hasProgress = (width: string) => tree.root.findAll((node) => Array.isArray(node.props.style) && node.props.style.some((style: { width?: string } | null) => style?.width === width)).length > 0;
    expect(checks()[0].props.accessibilityState.checked).toBe(false);
    expect(hasProgress('0%')).toBe(true);
    await act(async () => { checks()[0].props.onPress(); });
    expect(checks()[0].props.accessibilityState.checked).toBe(true);
    expect(hasProgress('100%')).toBe(true);
    expect(text()).toContain('오늘 할 일을 모두 끝냈어요!');
    await act(async () => { checks()[0].props.onPress(); });
    expect(checks()[0].props.accessibilityState.checked).toBe(false);
    expect(hasProgress('0%')).toBe(true);
    expect(text()).not.toContain('오늘 할 일을 모두 끝냈어요!');
  } finally { if (tree) act(() => tree.unmount()); jest.useRealTimers(); }
}, 15000);
