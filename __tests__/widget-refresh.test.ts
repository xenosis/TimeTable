/** @jest-environment node */
import { migrateDatabase } from '../src/db/migrations';
import { createTask } from '../src/db/taskRepository';
import { createTimetableItem } from '../src/db/timetableRepository';
import { createTimetableSet, getActiveTimetableSet, setActiveTimetableSet } from '../src/db/timetableSetRepository';
import type { TimetableItemInput } from '../src/db/types';
import { openTestDatabase } from '../test-utils/sqliteTestDatabase';

const mockWritten: string[] = [];
let mockDatabase: ReturnType<typeof openTestDatabase>;
let mockBridgeShouldFail = false;

jest.mock('../src/db/database', () => ({ getDatabase: async () => mockDatabase }));
jest.mock('../src/theme/selection', () => ({ themeSelectionStore: { load: async () => jest.requireActual('../src/theme').defaultTheme } }));
jest.mock('../src/widgets/widgetDataBridge', () => ({
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
