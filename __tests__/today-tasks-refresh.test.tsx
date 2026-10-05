import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TodayTasksCard } from '../src/components/TodayTasksCard';
import { getTodayTasks, type TodayTask } from '../src/db/taskRepository';
import { defaultTheme } from '../src/theme';

jest.mock('../src/db/database', () => ({ getDatabase: jest.fn(async () => ({})) }));
jest.mock('../src/db/taskRepository', () => ({ getTodayTasks: jest.fn() }));
jest.mock('../src/db/rewardRepository', () => ({ setTaskCompletionWithRewards: jest.fn() }));
jest.mock('../src/notifications/taskRollingSchedule', () => ({ requestTaskRollingScheduleRefresh: jest.fn() }));

it('외부 체크 변경 재조회 중에는 이전 체크를 누를 수 없고 최신 결과로 표시한다', async () => {
  const task = { id: 1, title: '책 읽기', completed: false } as unknown as TodayTask;
  jest.mocked(getTodayTasks).mockResolvedValueOnce([task]);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<TodayTasksCard theme={defaultTheme} refreshKey={0} />); });
  const checks = () => tree.root.findAll((node) => node.props.accessibilityRole === 'checkbox' && typeof node.props.onPress === 'function');
  expect(checks()[0].props.accessibilityState.checked).toBe(false);
  let resolve!: (tasks: readonly TodayTask[]) => void;
  jest.mocked(getTodayTasks).mockImplementationOnce(() => new Promise((res) => { resolve = res; }));
  await act(async () => { tree.update(<TodayTasksCard theme={defaultTheme} refreshKey={1} />); });
  expect(checks()).toHaveLength(0);
  await act(async () => { resolve([{ ...task, completed: true } as unknown as TodayTask]); });
  expect(checks()[0].props.accessibilityState.checked).toBe(true);
  act(() => tree.unmount());
});
