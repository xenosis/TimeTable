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
// 오늘 화면이 카드에 넘기는 세트 id와 체크 후 갱신 콜백을 확인하기 위해 props를 잡아 둔다
let mockScheduleSetId: number | null = null;
let mockOnTasksChanged: (() => void) | undefined;
jest.mock('../src/components/TodayScheduleCard', () => ({ TodayScheduleCard: ({ setId, children }: { setId: number | null; children: React.ReactNode }) => { mockScheduleSetId = setId; return children; } }));
jest.mock('../src/components/TodayTasksCard', () => ({ TodayTasksCard: ({ onChanged }: { onChanged?: () => void }) => { mockOnTasksChanged = onChanged; return null; } }));
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

it('세트를 읽은 뒤 체크로 새로고침하는 동안 로딩 배너 없이 이전 세트를 유지한다', async () => {
  jest.mocked(getActiveTimetableSet).mockResolvedValueOnce({ id: 1, name: '평소' } as Awaited<ReturnType<typeof getActiveTimetableSet>>);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<TodayScreen />); });
  const copy = () => tree.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');
  expect(mockScheduleSetId).toBe(1);
  let resolve!: (set: Awaited<ReturnType<typeof getActiveTimetableSet>>) => void;
  jest.mocked(getActiveTimetableSet).mockImplementationOnce(() => new Promise((res) => { resolve = res; }));
  await act(async () => { mockOnTasksChanged?.(); });
  expect(copy()).not.toContain('불러오는 중');
  expect(mockScheduleSetId).toBe(1);
  await act(async () => { resolve({ id: 2, name: '방학' } as Awaited<ReturnType<typeof getActiveTimetableSet>>); });
  expect(mockScheduleSetId).toBe(2);
  act(() => tree.unmount());
});
