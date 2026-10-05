import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TodayTasksCard } from '../src/components/TodayTasksCard';
import { setTaskCompletionWithRewards } from '../src/db/rewardRepository';
import { requestTaskRollingScheduleRefresh } from '../src/notifications/taskRollingSchedule';
import { getTodayTasks, type TodayTask } from '../src/db/taskRepository';
import { defaultTheme } from '../src/theme';

jest.mock('../src/db/database', () => ({ getDatabase: jest.fn(async () => ({})) }));
jest.mock('../src/db/taskRepository', () => ({ getTodayTasks: jest.fn() }));
jest.mock('../src/db/rewardRepository', () => ({ setTaskCompletionWithRewards: jest.fn() }));
jest.mock('../src/notifications/taskRollingSchedule', () => ({ requestTaskRollingScheduleRefresh: jest.fn() }));

it('외부 체크 변경 재조회 중에는 이전 목록을 유지하되 누를 수 없고 최신 결과로 표시한다', async () => {
  const task = { id: 1, title: '책 읽기', completed: false } as unknown as TodayTask;
  jest.mocked(getTodayTasks).mockResolvedValueOnce([task]);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<TodayTasksCard theme={defaultTheme} refreshKey={0} />); });
  const checks = () => tree.root.findAll((node) => node.props.accessibilityRole === 'checkbox' && typeof node.props.onPress === 'function');
  expect(checks()[0].props.accessibilityState.checked).toBe(false);
  let resolve!: (tasks: readonly TodayTask[]) => void;
  jest.mocked(getTodayTasks).mockImplementationOnce(() => new Promise((res) => { resolve = res; }));
  await act(async () => { tree.update(<TodayTasksCard theme={defaultTheme} refreshKey={1} />); });
  // 깜빡임 방지: 목록은 그대로 보이지만 최신 결과 전에는 비활성
  expect(checks()).toHaveLength(1);
  expect(checks()[0].props.disabled).toBe(true);
  expect(checks()[0].props.accessibilityState).toEqual({ checked: false, disabled: true });
  await act(async () => { checks()[0].props.onPress(); });
  expect(setTaskCompletionWithRewards).not.toHaveBeenCalled();
  await act(async () => { resolve([{ ...task, completed: true } as unknown as TodayTask]); });
  expect(checks()[0].props.accessibilityState).toEqual({ checked: true, disabled: false });
  act(() => tree.unmount());
});

it('알림 재예약 실패 안내는 체크 뒤 재조회가 성공해도 남아 있다', async () => {
  const task = { id: 1, title: '책 읽기', completed: false } as unknown as TodayTask;
  jest.mocked(getTodayTasks).mockResolvedValue([task]);
  jest.mocked(setTaskCompletionWithRewards).mockResolvedValue(undefined as never);
  jest.mocked(requestTaskRollingScheduleRefresh).mockRejectedValueOnce(new Error('alarm'));
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<TodayTasksCard theme={defaultTheme} refreshKey={0} />); });
  const copy = () => tree.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');
  const check = () => tree.root.findAll((node) => node.props.accessibilityRole === 'checkbox' && typeof node.props.onPress === 'function')[0];
  jest.mocked(getTodayTasks).mockResolvedValue([{ ...task, completed: true } as unknown as TodayTask]);
  await act(async () => { check().props.onPress(); });
  // 오늘 화면이 onChanged로 refreshKey를 올려 다시 조회한 상황
  await act(async () => { tree.update(<TodayTasksCard theme={defaultTheme} refreshKey={1} />); });
  expect(copy()).toContain('알림을 다시 예약하지 못했어요');
  act(() => tree.unmount());
});
