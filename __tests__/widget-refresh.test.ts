/** @jest-environment node */
import { migrateDatabase } from '../src/db/migrations';
import { createTask } from '../src/db/taskRepository';
import { createTimetableItem } from '../src/db/timetableRepository';
import { createTimetableSet, getActiveTimetableSet, setActiveTimetableSet } from '../src/db/timetableSetRepository';
import type { TimetableItemInput } from '../src/db/types';
import { toLocalDateStr } from '../src/utils/date';
import { subscribeWidgetChecksApplied } from '../src/widgets/widgetChecksSignal';
import { openTestDatabase } from '../test-utils/sqliteTestDatabase';

const mockWritten: string[] = [];
let mockDatabase: ReturnType<typeof openTestDatabase>;
let mockBridgeShouldFail = false;
let mockPending = '[]';
const mockAcked: string[] = [];
const mockReplaceTaskNotifications = jest.fn(async (..._args: unknown[]) => 1);

jest.mock('../src/db/database', () => ({ getDatabase: async () => mockDatabase }));
jest.mock('../src/theme/selection', () => ({ themeSelectionStore: { load: async () => jest.requireActual('../src/theme').defaultTheme } }));
jest.mock('../src/notifications/taskRollingSchedule', () => ({ replaceRollingNotificationsFromDatabase: (...args: unknown[]) => mockReplaceTaskNotifications(...args) }));
jest.mock('../src/widgets/widgetDataBridge', () => ({
  peekPendingWidgetChecks: async () => mockPending,
  ackPendingWidgetChecks: async (applied: string) => { mockAcked.push(applied); },
  writeWidgetData: async (data: unknown) => {
    if (mockBridgeShouldFail) throw new Error('bridge down');
    mockWritten.push(JSON.stringify(data));
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { refreshWidgetQuietly, requestWidgetRefresh } = require('../src/widgets/widgetRefresh') as typeof import('../src/widgets/widgetRefresh');

const item = (setId: number, title: string, category: TimetableItemInput['category'] = 'academy'): TimetableItemInput => ({
  weekday: new Date().getDay(), startTime: '17:00', endTime: '18:00', title, category, colorKey: 'math', iconKey: 'number', setId,
});

beforeEach(async () => {
  mockWritten.length = 0;
  mockBridgeShouldFail = false;
  mockPending = '[]';
  mockAcked.length = 0;
  mockReplaceTaskNotifications.mockClear();
  mockDatabase = openTestDatabase();
  await migrateDatabase(mockDatabase);
});

describe('requestWidgetRefresh', () => {
  it('적용 중인 시간표의 7일치를 만들어 위젯 파일에 쓴다(학교 일정은 제외)', async () => {
    const regular = (await getActiveTimetableSet(mockDatabase)).id;
    await createTimetableItem(mockDatabase, item(regular, '피아노'));
    await createTimetableItem(mockDatabase, item(regular, '정규 수업', 'school'));
    await requestWidgetRefresh();
    expect(mockWritten).toHaveLength(1);
    const data = JSON.parse(mockWritten[0]);
    expect(data).toMatchObject({ schemaVersion: 2, timetableName: '평소' });
    expect(data.days).toHaveLength(7);
    expect(data.days[0].schedule.map((entry: { title: string }) => entry.title)).toEqual(['피아노']);
  });

  it('시간표를 바꾼 뒤 다시 부르면 바뀐 시간표가 쓰인다', async () => {
    const regular = (await getActiveTimetableSet(mockDatabase)).id;
    const summer = await createTimetableSet(mockDatabase, '여름방학');
    await createTimetableItem(mockDatabase, item(regular, '학기 학원'));
    await createTimetableItem(mockDatabase, item(summer, '방학 돌봄'));
    await requestWidgetRefresh();
    await setActiveTimetableSet(mockDatabase, summer);
    await requestWidgetRefresh();
    expect(JSON.parse(mockWritten[0]).days[0].schedule[0].title).toBe('학기 학원');
    expect(JSON.parse(mockWritten[1])).toMatchObject({ timetableName: '여름방학' });
    expect(JSON.parse(mockWritten[1]).days[0].schedule[0].title).toBe('방학 돌봄');
  });

  it('할 일도 함께 쓰인다', async () => {
    await createTask(mockDatabase, { title: '준비물 챙기기', repeatWeekdays: [0, 1, 2, 3, 4, 5, 6], taskDate: '', effectiveFrom: '2026-01-01' });
    await requestWidgetRefresh();
    expect(JSON.parse(mockWritten[0]).days[0].tasks.map((task: { title: string }) => task.title)).toEqual(['준비물 챙기기']);
  });

  it('동시에 여러 번 불려도 마지막 상태가 반영된다', async () => {
    const regular = (await getActiveTimetableSet(mockDatabase)).id;
    const first = requestWidgetRefresh();
    await createTimetableItem(mockDatabase, item(regular, '중간에 추가한 학원'));
    await Promise.all([first, requestWidgetRefresh(), requestWidgetRefresh()]);
    const last = JSON.parse(mockWritten[mockWritten.length - 1]);
    expect(last.days[0].schedule.map((entry: { title: string }) => entry.title)).toContain('중간에 추가한 학원');
  });
});

describe('requestWidgetRefresh: 위젯에서 누른 체크', () => {
  const todayKey = async () => toLocalDateStr(new Date());

  async function makeTask(title: string): Promise<number> {
    await createTask(mockDatabase, { title, repeatWeekdays: [0, 1, 2, 3, 4, 5, 6], taskDate: '', effectiveFrom: '2026-01-01' });
    return (await mockDatabase.getFirstAsync<{ id: number }>('SELECT id FROM tasks WHERE title = ?', title))!.id;
  }

  it('대기 중인 체크를 DB에 먼저 기록하고, 위젯 데이터에 완료로 들어간다', async () => {
    const id = await makeTask('준비물 챙기기');
    mockPending = JSON.stringify([{ taskId: id, date: await todayKey(), completed: true }]);
    await requestWidgetRefresh();
    const task = JSON.parse(mockWritten[0]).days[0].tasks.find((entry: { id: number }) => entry.id === id);
    expect(task.completed).toBe(true);
    const saved = await mockDatabase.getAllAsync('SELECT task_id FROM task_completions WHERE task_id = ?', id);
    expect(saved).toHaveLength(1);
    expect(mockReplaceTaskNotifications).toHaveBeenCalledTimes(1); // 끝낸 할 일의 재알림이 더 울리지 않게 다시 예약
  });

  it('기록한 체크는 확인(삭제) 요청을 하고, 열려 있는 화면에 반영됐다고 알린다', async () => {
    const id = await makeTask('준비물 챙기기');
    const check = { taskId: id, date: await todayKey(), completed: true };
    mockPending = JSON.stringify([check]);
    const refreshed = jest.fn();
    const unsubscribe = subscribeWidgetChecksApplied(refreshed);
    await requestWidgetRefresh();
    unsubscribe();
    expect(mockAcked).toEqual([JSON.stringify([check])]);
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('반영할 체크가 없으면 화면에 알리지 않는다', async () => {
    await makeTask('숙제');
    const refreshed = jest.fn();
    const unsubscribe = subscribeWidgetChecksApplied(refreshed);
    await requestWidgetRefresh();
    unsubscribe();
    expect(refreshed).not.toHaveBeenCalled();
    expect(mockAcked).toEqual([]);
  });

  it('대기 중인 체크가 없으면 할 일 알림을 다시 예약하지 않는다', async () => {
    await makeTask('숙제');
    await requestWidgetRefresh();
    expect(mockReplaceTaskNotifications).not.toHaveBeenCalled();
    expect(JSON.parse(mockWritten[0]).days[0].tasks[0].completed).toBe(false);
  });

  it('체크를 읽지 못해도 위젯 데이터는 그대로 쓴다', async () => {
    await makeTask('숙제');
    mockPending = 'not-json';
    await requestWidgetRefresh();
    expect(mockWritten).toHaveLength(1);
  });
});

describe('refreshWidgetQuietly', () => {
  it('위젯 쓰기가 실패해도 예외를 던지지 않는다(알림 재예약 결과를 망치지 않기 위함)', async () => {
    mockBridgeShouldFail = true;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(refreshWidgetQuietly()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('실패한 뒤 다시 부르면 정상으로 돌아온다', async () => {
    mockBridgeShouldFail = true;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await refreshWidgetQuietly();
    mockBridgeShouldFail = false;
    await refreshWidgetQuietly();
    warn.mockRestore();
    expect(mockWritten).toHaveLength(1);
  });
});
