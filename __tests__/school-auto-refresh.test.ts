/** @jest-environment node */
import { migrateDatabase } from '../src/db/migrations';
import { savePeriods } from '../src/db/periodRepository';
import { createTimetableItem, getEditableTimetableItems } from '../src/db/timetableRepository';
import { getActiveTimetableSet } from '../src/db/timetableSetRepository';
import type { TimetableDatabase } from '../src/db/types';
import { getScheduleForDate } from '../src/db/dateSchedule';
import { refreshSchoolTimetableIfDue, scheduleSignature } from '../src/neis/schoolAutoRefresh';
import { setAccount } from '../src/store/accountStore';
import { openTestDatabase } from '../test-utils/sqliteTestDatabase';

const mockStore = new Map<string, string>();
jest.mock('expo-sqlite/kv-store', () => ({ __esModule: true, default: {
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { mockStore.set(key, value); },
  removeItemAsync: async (key: string) => { mockStore.delete(key); },
} }));
let mockDatabase: TimetableDatabase;
jest.mock('../src/db/database', () => ({ getDatabase: async () => mockDatabase }));
const mockFetch = jest.fn();
const mockHolidays = jest.fn();
jest.mock('../src/neis/neisClient', () => ({ fetchClassTimetable: (...args: unknown[]) => mockFetch(...args), fetchSchoolHolidays: (...args: unknown[]) => mockHolidays(...args) }));
let mockRunnerRegistered = true;
jest.mock('../src/sync/adminEditGate', () => ({ runAdminEdit: (action: () => Promise<unknown>) => action(), isAdminEditRunnerRegistered: () => mockRunnerRegistered }));
jest.mock('../src/sync/syncMarkers', () => ({ hasSyncedFamily: () => true }));
jest.mock('../src/notifications/rollingOwners', () => ({ refreshAllRollingOwners: jest.fn(async () => undefined) }));
jest.mock('../src/widgets/widgetChecksSignal', () => ({ notifyWidgetChecksApplied: jest.fn() }));

// 2026-10-08은 목요일 → 이번 주 10/5~10/9를 확인한다
const THURSDAY = new Date(2026, 9, 8, 9, 0);
const row = (date: string, period: number, subject: string) => ({ date, classNo: '6', period, subject });
const week = (overrides: Record<string, string[]> = {}) => {
  const base: Record<string, string[]> = { '20261005': ['국어', '수학'], '20261006': ['국어', '즐거운생활'], '20261007': ['수학'], '20261008': ['국어'], '20261009': ['바른생활'] , ...overrides };
  return Object.entries(base).flatMap(([date, subjects]) => subjects.map((subject, index) => row(date, index + 1, subject)));
};
let setId: number;

beforeEach(async () => {
  mockStore.clear();
  mockStore.set('timetable.school-profile', JSON.stringify({ officeCode: 'J10', schoolCode: '7591095', schoolName: '빛가온초등학교', grade: 2, classNo: '6' }));
  mockFetch.mockReset();
  mockHolidays.mockReset();
  mockHolidays.mockResolvedValue(new Map([['20261009', '한글날']]));
  mockRunnerRegistered = true;
  setAccount({ kind: 'local' });
  mockDatabase = openTestDatabase();
  await migrateDatabase(mockDatabase);
  setId = (await getActiveTimetableSet(mockDatabase)).id;
  await savePeriods(mockDatabase, [{ periodNo: 1, startTime: '09:00', endTime: '09:40' }, { periodNo: 2, startTime: '09:50', endTime: '10:30' }]);
  await createTimetableItem(mockDatabase, { weekday: 2, startTime: '16:00', endTime: '17:00', title: '피아노', category: 'academy', colorKey: 'academy', iconKey: 'academy', setId });
});
afterEach(() => setAccount({ kind: 'checking' }));

const schoolTitles = async () => (await getEditableTimetableItems(mockDatabase, setId)).map((item) => `${item.weekday}:${item.periodNo ?? item.startTime}:${item.title}`).sort();

test('이번 주 나이스 시간표로 학교 일정만 바꾸고 학원 일정은 그대로 둔다', async () => {
  mockFetch.mockResolvedValue(week());
  const state = await refreshSchoolTimetableIfDue(THURSDAY);
  expect(state?.result).toBe('updated');
  expect(mockFetch).toHaveBeenCalledWith(expect.objectContaining({ schoolCode: '7591095' }), 2, '6', '20261005', '20261009');
  expect(await schoolTitles()).toEqual(['1:1:국어', '1:2:수학', '2:16:00:피아노', '2:1:국어', '2:2:즐거운생활', '3:1:수학', '4:1:국어', '5:1:바른생활']);
});

test('같은 주는 6시간 안에 다시 묻지 않고, 내용이 같으면 다시 쓰지 않는다', async () => {
  mockFetch.mockResolvedValue(week());
  await refreshSchoolTimetableIfDue(THURSDAY);
  const again = await refreshSchoolTimetableIfDue(new Date(THURSDAY.getTime() + 60 * 60 * 1000));
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(again?.result).toBe('updated'); // 이전 상태를 그대로 돌려준다
  const later = await refreshSchoolTimetableIfDue(new Date(THURSDAY.getTime() + 7 * 60 * 60 * 1000));
  expect(mockFetch).toHaveBeenCalledTimes(2);
  expect(later?.result).toBe('same');
});

test('주 중에 학교가 시간표를 바꾸면 다음 확인 때 반영한다', async () => {
  mockFetch.mockResolvedValue(week());
  await refreshSchoolTimetableIfDue(THURSDAY);
  mockFetch.mockResolvedValue(week({ '20261009': ['국어', '수학'] }));
  const state = await refreshSchoolTimetableIfDue(THURSDAY, true);
  expect(state?.result).toBe('updated');
  expect((await schoolTitles()).filter((title) => title.startsWith('5:'))).toEqual(['5:1:국어', '5:2:수학']);
});

const holidays = async () => (await mockDatabase.getAllAsync<{ start_date: string; note: string }>("SELECT start_date, note FROM day_exceptions WHERE type = 'holiday' ORDER BY start_date")).map((row) => `${row.start_date}:${row.note}`);

test('공휴일은 매주 반복 시간표를 지우지 않고 날짜별 휴일로 저장해 그날만 비운다(학원도 숨김)', async () => {
  await createTimetableItem(mockDatabase, { weekday: 5, periodNo: 1, title: '옛 금요일', category: 'school', colorKey: 'other', iconKey: 'other', setId });
  await createTimetableItem(mockDatabase, { weekday: 5, startTime: '16:00', endTime: '17:00', title: '금요 학원', category: 'academy', colorKey: 'academy', iconKey: 'academy', setId });
  mockFetch.mockResolvedValue(week({ '20261009': [] }));
  const state = await refreshSchoolTimetableIfDue(THURSDAY);
  expect(mockHolidays).toHaveBeenCalledWith(expect.objectContaining({ schoolCode: '7591095' }), '20261005', '20261101');
  expect((await schoolTitles()).filter((title) => title.startsWith('5:'))).toEqual(['5:16:00:금요 학원', '5:1:옛 금요일']);
  expect(await holidays()).toEqual(['2026-10-09:나이스: 한글날']);
  expect(state?.message).toContain('쉬는 날(공휴일) 정보도 맞췄어요');
  const friday = await getScheduleForDate(mockDatabase, new Date(2026, 9, 9), setId);
  expect(friday).toMatchObject({ holiday: '한글날', items: [] });
  expect((await getScheduleForDate(mockDatabase, new Date(2026, 9, 16), setId)).items.map((item) => item.title)).toEqual(['옛 금요일', '금요 학원']);
});

test('나이스에서 사라진 자동 휴일은 지우고, 아빠가 직접 넣은 휴일은 그대로 둔다', async () => {
  await mockDatabase.runAsync("INSERT INTO day_exceptions (start_date, end_date, type, note) VALUES ('2026-10-14', '2026-10-14', 'holiday', '나이스: 개교기념일'), ('2026-10-15', '2026-10-15', 'holiday', '가족 여행')");
  mockFetch.mockResolvedValue(week());
  await refreshSchoolTimetableIfDue(THURSDAY);
  expect(await holidays()).toEqual(['2026-10-09:나이스: 한글날', '2026-10-15:가족 여행']);
  mockHolidays.mockRejectedValue(new Error('학사일정 실패'));
  await refreshSchoolTimetableIfDue(THURSDAY, true);
  expect(await holidays()).toEqual(['2026-10-09:나이스: 한글날', '2026-10-15:가족 여행']); // 못 읽으면 그대로
});

test('주 전체가 비었거나 교시 시간이 없거나 나이스에 연결하지 못하면 바꾸지 않고 상태만 남긴다', async () => {
  await createTimetableItem(mockDatabase, { weekday: 1, periodNo: 1, title: '옛 월요일', category: 'school', colorKey: 'other', iconKey: 'other', setId });
  mockFetch.mockResolvedValue([]);
  expect((await refreshSchoolTimetableIfDue(THURSDAY, true))?.result).toBe('empty');
  mockFetch.mockResolvedValue(week({ '20261005': ['국어', '수학', '영어'] }));
  const missing = await refreshSchoolTimetableIfDue(THURSDAY, true);
  expect(missing?.result).toBe('missing-periods');
  expect(missing?.message).toContain('3교시');
  mockFetch.mockRejectedValue(new Error('나이스에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'));
  expect((await refreshSchoolTimetableIfDue(THURSDAY, true))?.result).toBe('error');
  expect(await schoolTitles()).toContain('1:1:옛 월요일');
});

test('아빠 폰과 계정 확인 전, 학교 설정이 없으면 자동 갱신하지 않는다', async () => {
  mockFetch.mockResolvedValue(week());
  setAccount({ kind: 'signedIn', email: 'dad@x', membership: { role: 'parent', familyId: 'f' }, offline: false });
  expect(await refreshSchoolTimetableIfDue(THURSDAY, true)).toBeNull();
  setAccount({ kind: 'checking' });
  expect(await refreshSchoolTimetableIfDue(THURSDAY, true)).toBeNull();
  setAccount({ kind: 'local' });
  mockStore.delete('timetable.school-profile');
  expect(await refreshSchoolTimetableIfDue(THURSDAY, true)).toBeNull();
  expect(mockFetch).not.toHaveBeenCalled();
});

test('학교가 아직 입력하지 않은 빈 요일은 반복 시간표를 그대로 두고 휴일로도 만들지 않는다', async () => {
  await createTimetableItem(mockDatabase, { weekday: 3, periodNo: 1, title: '옛 수요일', category: 'school', colorKey: 'other', iconKey: 'other', setId });
  mockFetch.mockResolvedValue(week({ '20261007': [] }));
  await refreshSchoolTimetableIfDue(THURSDAY);
  expect((await schoolTitles()).filter((title) => title.startsWith('3:'))).toEqual(['3:1:옛 수요일']);
  expect(await holidays()).toEqual(['2026-10-09:나이스: 한글날']);
});

test('같은 주라도 실패했으면 30분 뒤 다시 확인한다', async () => {
  mockFetch.mockRejectedValueOnce(new Error('나이스에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'));
  expect((await refreshSchoolTimetableIfDue(THURSDAY))?.result).toBe('error');
  mockFetch.mockResolvedValue(week());
  expect((await refreshSchoolTimetableIfDue(new Date(THURSDAY.getTime() + 10 * 60 * 1000)))?.result).toBe('error');
  expect((await refreshSchoolTimetableIfDue(new Date(THURSDAY.getTime() + 31 * 60 * 1000)))?.result).toBe('updated');
});

test('딸 계정이어도 서버에 먼저 저장하는 편집 경로가 없으면(화면 없는 백그라운드 실행) 하지 않는다', async () => {
  mockFetch.mockResolvedValue(week());
  setAccount({ kind: 'signedIn', email: 'kid@x', membership: { role: 'child', familyId: 'f' }, offline: false });
  mockRunnerRegistered = false;
  expect(await refreshSchoolTimetableIfDue(THURSDAY, true)).toBeNull();
  mockRunnerRegistered = true;
  expect((await refreshSchoolTimetableIfDue(THURSDAY, true))?.result).toBe('updated');
});

test('비교용 문자열은 교시 순서와 무관하게 같다', () => {
  expect(scheduleSignature([{ weekday: 1, entries: [{ period: 2, subject: '수학' }, { period: 1, subject: '국어' }] }]))
    .toBe(scheduleSignature([{ weekday: 1, entries: [{ period: 1, subject: '국어' }, { period: 2, subject: '수학' }] }]));
});
