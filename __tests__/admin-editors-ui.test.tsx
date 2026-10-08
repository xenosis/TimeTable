import { Alert, BackHandler } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';

import { TaskEditor } from '../src/components/TaskEditor';
import { TimetableEditor } from '../src/components/TimetableEditor';
import { defaultTheme } from '../src/theme';

const mockItem = { id: 7, weekday: new Date().getDay(), periodNo: null, startTime: '16:00', endTime: '17:00', title: '피아노', category: 'academy', colorKey: 'academy', iconKey: 'academy', alertMode: 'none', alertBeforeMin: 0, memo: '' };
const mockTask = { id: 3, title: '숙제', repeatWeekdays: '1', taskDate: null, effectiveFrom: '2026-10-01', remindTime: null, alertMode: 'none' };
const mockDeleteItem = jest.fn(async () => undefined);
const mockDeleteTask = jest.fn(async () => undefined);
jest.mock('../src/db/database', () => ({ getDatabase: async () => ({}) }));
jest.mock('../src/db/periodRepository', () => ({ getPeriods: async () => [] }));
jest.mock('../src/db/timetableRepository', () => ({
  MAX_MEMO_LENGTH: 100,
  getEditableTimetableItems: async () => [mockItem],
  createTimetableItems: jest.fn(), updateTimetableItem: jest.fn(),
  deleteTimetableItem: (...args: unknown[]) => mockDeleteItem(...(args as [])),
}));
jest.mock('../src/db/taskRepository', () => ({
  getEditableTasks: async () => [mockTask], getEndableTasks: async () => [],
  createTask: jest.fn(), updateTask: jest.fn(), endRecurringTask: jest.fn(),
  deleteTask: (...args: unknown[]) => mockDeleteTask(...(args as [])),
}));
jest.mock('../src/db/rewardRepository', () => ({ editTaskWithRewards: async (_db: unknown, _d: unknown, _w: unknown, edit: () => Promise<void>) => edit() }));
jest.mock('../src/sync/adminEditGate', () => ({ runAdminEdit: (action: () => Promise<unknown>) => action() }));

const texts = (node: ReactTestInstance): string => node.findAll((child) => (child.type as unknown) === 'Text').map((child) => child.children.filter((value) => typeof value === 'string').join('')).join(' | ');
const pressByText = (root: ReactTestInstance, label: string) => {
  const target = root.findAll((node) => typeof node.props.onPress === 'function' && texts(node).split(' | ').includes(label))[0];
  if (!target) throw new Error(`버튼 없음: ${label}`);
  act(() => { target.props.onPress(); });
};
const alertButton = (title: string, buttonText: string) => {
  const call = jest.mocked(Alert.alert).mock.calls.find(([alertTitle]) => alertTitle === title);
  if (!call) throw new Error(`알림 창 없음: ${title}`);
  return (call[2] ?? []).find((button) => button.text === buttonText)!;
};

let backHandlers: (() => boolean)[] = [];
beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  backHandlers = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    backHandlers.push(handler as () => boolean);
    return { remove: () => { backHandlers = backHandlers.filter((item) => item !== handler); } };
  });
  mockDeleteItem.mockClear(); mockDeleteTask.mockClear();
});
afterEach(() => jest.restoreAllMocks());

async function renderTimetable() {
  const onOpenChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TimetableEditor refreshKey={0} theme={defaultTheme} onChanged={async () => undefined} setId={1} onOpenChange={onOpenChange} />); });
  return { root: renderer.root, onOpenChange };
}

test('시간표 항목 폼은 목록 자리에서 열리고, 휴대폰 뒤로 가기는 미저장 입력이 있으면 버림 확인을 거친다', async () => {
  const { root, onOpenChange } = await renderTimetable();
  pressByText(root, '추가');
  expect(texts(root)).toContain('항목 추가');
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
  // 입력 없이 뒤로 가기: 확인 없이 닫힘
  expect(backHandlers).toHaveLength(1);
  act(() => { backHandlers[0](); });
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(texts(root)).toContain('시간표 항목');
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
  expect(backHandlers).toHaveLength(0);
  // 제목을 입력한 뒤 뒤로 가기: 버림 확인
  pressByText(root, '추가');
  const title = root.find((node) => node.props.placeholder === '과목 또는 일정' && typeof node.props.onChangeText === 'function');
  act(() => { title.props.onChangeText('수영'); });
  let handled = false;
  act(() => { handled = backHandlers[0](); });
  expect(handled).toBe(true);
  expect(Alert.alert).toHaveBeenCalledWith('작성 중인 내용이 있어요', expect.any(String), expect.any(Array));
  act(() => { alertButton('작성 중인 내용이 있어요', '버리고 닫기').onPress?.(); });
  expect(texts(root)).toContain('요일을 고르고 항목을 누르거나 추가를 눌러 주세요.');
});

test('시간표 항목 삭제는 확인 창을 거치고, 취소하면 지우지 않는다', async () => {
  const { root } = await renderTimetable();
  pressByText(root, '피아노');
  pressByText(root, '삭제');
  expect(Alert.alert).toHaveBeenCalledWith('이 항목을 지울까요?', expect.stringContaining('피아노'), expect.any(Array));
  expect(mockDeleteItem).not.toHaveBeenCalled();
  await act(async () => { alertButton('이 항목을 지울까요?', '지우기').onPress?.(); });
  expect(mockDeleteItem).toHaveBeenCalledTimes(1);
});

test('할 일 삭제도 확인 창을 거친다', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TaskEditor theme={defaultTheme} onChanged={async () => undefined} />); });
  pressByText(renderer.root, '숙제');
  pressByText(renderer.root, '삭제');
  expect(Alert.alert).toHaveBeenCalledWith('이 할 일을 지울까요?', expect.stringContaining('숙제'), expect.any(Array));
  expect(mockDeleteTask).not.toHaveBeenCalled();
  await act(async () => { alertButton('이 할 일을 지울까요?', '지우기').onPress?.(); });
  expect(mockDeleteTask).toHaveBeenCalledTimes(1);
});
