import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { TodayTasksCard } from '../src/components/TodayTasksCard';
import { getTodayTasks, type TodayTask } from '../src/db/taskRepository';
import { defaultTheme } from '../src/theme';

jest.mock('../src/db/database', () => ({ getDatabase: jest.fn(async () => ({})) }));
jest.mock('../src/db/taskRepository', () => ({ getTodayTasks: jest.fn() }));
jest.mock('../src/db/rewardRepository', () => ({ setTaskCompletionWithRewards: jest.fn() }));
jest.mock('../src/notifications/taskRollingSchedule', () => ({ requestTaskRollingScheduleRefresh: jest.fn() }));

// P4.5: 자정이 지나 refreshKey가 바뀌면 새 날짜·요일로 다시 조회하고 어제 전용 할 일은 사라진다.
it('자정 뒤 갱신하면 새 날짜·요일로 조회하고 어제 할 일이 목록에서 빠진다', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 5, 23, 59, 0)); // 월요일
  jest.mocked(getTodayTasks).mockImplementation(async (_db, date) => (date === '2026-10-05' ? [{ id: 1, title: '월요일 숙제', completed: true }] : [{ id: 2, title: '화요일 준비물', completed: false }]) as unknown as readonly TodayTask[]);
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<TodayTasksCard theme={defaultTheme} refreshKey={0} />); });
  const copy = () => tree.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');
  expect(copy()).toContain('월요일 숙제');
  jest.setSystemTime(new Date(2026, 9, 6, 0, 0, 1)); // 화요일
  await act(async () => { tree.update(<TodayTasksCard theme={defaultTheme} refreshKey={1} />); });
  expect(getTodayTasks).toHaveBeenLastCalledWith(expect.anything(), '2026-10-06', 2);
  expect(copy()).toContain('화요일 준비물');
  expect(copy()).not.toContain('월요일 숙제');
  act(() => tree.unmount());
  jest.useRealTimers();
});
