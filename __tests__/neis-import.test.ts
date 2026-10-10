/** @jest-environment node */
import { migrateDatabase } from '../src/db/migrations';
import { savePeriods } from '../src/db/periodRepository';
import { createTimetableItem, getEditableTimetableItems } from '../src/db/timetableRepository';
import { getActiveTimetableSet } from '../src/db/timetableSetRepository';
import { fetchClassTimetable, fetchMeals, fetchSchoolHolidays, searchElementarySchools } from '../src/neis/neisClient';
import { buildWeekPlan, missingPeriods, replaceSchoolItems, schoolWeekDates, subjectStyle } from '../src/neis/neisImport';
import { parseSchoolProfile } from '../src/neis/schoolProfile';
import { openTestDatabase } from '../test-utils/sqliteTestDatabase';

jest.mock('../src/db/database', () => ({ getDatabase: jest.fn() }));
jest.mock('expo-sqlite/kv-store', () => ({ __esModule: true, default: { getItemAsync: jest.fn(), setItemAsync: jest.fn() } }));

const response = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
const neisRow = (date: string, period: number, subject: string | null, cls = '6') => ({ ALL_TI_YMD: date, CLASS_NM: cls, PERIO: String(period), ITRT_CNTNT: subject });

beforeAll(() => { process.env.EXPO_PUBLIC_NEIS_API_KEY = 'test-key'; });

describe('나이스 조회', () => {
  it('초등학교를 이름으로 찾아 교육청·학교 코드를 돌려준다', async () => {
    const fetcher = jest.fn(response({ schoolInfo: [{ head: [] }, { row: [{ ATPT_OFCDC_SC_CODE: 'J10', SD_SCHUL_CODE: '7591095', SCHUL_NM: '빛가온초등학교', ORG_RDNMA: '경기도 광명시' }] }] }));
    await expect(searchElementarySchools('빛가온', fetcher)).resolves.toEqual([{ officeCode: 'J10', schoolCode: '7591095', name: '빛가온초등학교', address: '경기도 광명시' }]);
    const url = String(fetcher.mock.calls[0][0]);
    expect(url).toContain('/hub/schoolInfo?');
    expect(url).toContain('KEY=test-key');
    await expect(searchElementarySchools('빛', fetcher)).rejects.toThrow('두 글자 이상');
  });

  it('반 시간표를 읽고, 데이터 없음(INFO-200)은 빈 목록, 연결 실패는 알기 쉬운 오류다', async () => {
    const rows = [neisRow('20261013', 1, '국어'), neisRow('20261013', 2, null)];
    const fetcher = jest.fn(response({ elsTimetable: [{ head: [] }, { row: rows }] }));
    await expect(fetchClassTimetable({ officeCode: 'J10', schoolCode: '7591095' }, 2, '6', '20261012', '20261016', fetcher)).resolves.toEqual([
      { date: '20261013', classNo: '6', period: 1, subject: '국어' }, { date: '20261013', classNo: '6', period: 2, subject: '' },
    ]);
    expect(String(fetcher.mock.calls[0][0])).toContain('GRADE=2&CLASS_NM=6&TI_FROM_YMD=20261012&TI_TO_YMD=20261016');
    await expect(fetchClassTimetable({ officeCode: 'J10', schoolCode: '1' }, 2, '6', 'a', 'b', response({ RESULT: { CODE: 'INFO-200' } }))).resolves.toEqual([]);
    const offline = (async () => { throw new TypeError('network'); }) as unknown as typeof fetch;
    await expect(fetchClassTimetable({ officeCode: 'J10', schoolCode: '1' }, 2, '6', 'a', 'b', offline)).rejects.toThrow('인터넷 연결');
  });
});

describe('나이스 학사일정', () => {
  it('평일 공휴일은 쉬는 날, 방학이 아닌 휴업일은 학교만 쉬는 날로 읽고, 토요휴업일·방학·수업일 행사는 뺀다', async () => {
    const row = (date: string, name: string, kind: string) => ({ AA_YMD: date, EVENT_NM: name, SBTR_DD_SC_NM: kind });
    const fetcher = jest.fn(response({ SchoolSchedule: [{ head: [] }, { row: [
      row('20261005', '대체공휴일', '공휴일'), row('20261009', '한글날', '공휴일'), row('20261010', '토요휴업일', '휴업일'),
      row('20261014', '재량휴업일', '휴업일'), row('20261015', '현장체험학습', '해당없음'),
      row('20260727', '여름방학', '휴업일'), row('20260817', '여름방학', '휴업일'), row('20260817', '대체공휴일', '공휴일'),
    ] }] }));
    expect([...await fetchSchoolHolidays({ officeCode: 'J10', schoolCode: '7591095' }, '20261005', '20261101', fetcher)]).toEqual([
      ['20261005', { name: '대체공휴일', kind: 'holiday' }], ['20261009', { name: '한글날', kind: 'holiday' }],
      ['20261014', { name: '재량휴업일', kind: 'school-off' }], ['20260817', { name: '대체공휴일', kind: 'holiday' }],
    ]);
    expect(String(fetcher.mock.calls[0][0])).toContain('/hub/SchoolSchedule?');
  });
});

describe('나이스 급식', () => {
  it('끼니별 메뉴를 줄 단위로 나눠 읽고, 메뉴가 없는 행은 뺀다', async () => {
    const fetcher = jest.fn(response({ mealServiceDietInfo: [{ head: [] }, { row: [
      { MLSV_YMD: '20261013', MMEAL_SC_NM: '중식', DDISH_NM: '칼슘쌀밥ㅅ <br/>쇠고기미역국ㅅ (5.6.16)', CAL_INFO: '657.7 Kcal' },
      { MLSV_YMD: '20261014', MMEAL_SC_NM: '중식', DDISH_NM: '', CAL_INFO: '' },
    ] }] }));
    await expect(fetchMeals({ officeCode: 'J10', schoolCode: '7591095' }, '20261012', '20261018', fetcher)).resolves.toEqual([
      { date: '20261013', kind: '중식', dishes: ['칼슘쌀밥ㅅ', '쇠고기미역국ㅅ (5.6.16)'], calories: '657.7 Kcal' },
    ]);
    expect(String(fetcher.mock.calls[0][0])).toContain('/hub/mealServiceDietInfo?');
    expect(String(fetcher.mock.calls[0][0])).toContain('MLSV_FROM_YMD=20261012&MLSV_TO_YMD=20261018');
  });
});

describe('나이스 시간표 변환', () => {
  it('이번 주·다음 주 월~금 날짜를 만든다(주말에는 다음 주부터)', () => {
    expect(schoolWeekDates(new Date(2026, 9, 8), false)).toEqual(['20261005', '20261006', '20261007', '20261008', '20261009']);
    expect(schoolWeekDates(new Date(2026, 9, 8), true)[0]).toBe('20261012');
    expect(schoolWeekDates(new Date(2026, 9, 10), false)[0]).toBe('20261012'); // 토요일
  });

  it('요일별로 교시 순으로 묶고, 과목이 빈 요일(공휴일)은 비워 둔다', () => {
    const rows = [neisRow('20261013', 2, '즐거운생활'), neisRow('20261013', 1, '국어'), neisRow('20261009', 1, null)].map((row) => ({ date: row.ALL_TI_YMD, classNo: row.CLASS_NM, period: Number(row.PERIO), subject: row.ITRT_CNTNT ?? '' }));
    const plan = buildWeekPlan(rows, ['20261009', '20261013']);
    expect(plan).toEqual([
      { date: '20261009', weekday: 5, entries: [] },
      { date: '20261013', weekday: 2, entries: [{ period: 1, subject: '국어' }, { period: 2, subject: '즐거운생활' }] },
    ]);
    expect(missingPeriods(plan, [1])).toEqual([2]);
    expect(missingPeriods(plan, [1, 2, 3])).toEqual([]);
  });

  it('국어·수학 등은 과목 색, 통합교과·창체는 기타 색이다', () => {
    expect(subjectStyle('국어')).toEqual({ colorKey: 'korean', iconKey: 'text' });
    expect(subjectStyle('수학')).toEqual({ colorKey: 'math', iconKey: 'number' });
    expect(subjectStyle('즐거운생활')).toEqual({ colorKey: 'other', iconKey: 'other' });
    expect(subjectStyle('자율·자치활동')).toEqual({ colorKey: 'other', iconKey: 'other' });
  });

  it('학교·학년·반 설정은 학년 1~6과 반이 있어야 저장된 값으로 본다', () => {
    const profile = { officeCode: 'J10', schoolCode: '7591095', schoolName: '빛가온초등학교', grade: 2, classNo: '6' };
    expect(parseSchoolProfile(JSON.stringify(profile))).toEqual(profile);
    expect(parseSchoolProfile(JSON.stringify({ ...profile, grade: 7 }))).toBeNull();
    expect(parseSchoolProfile('{망가짐')).toBeNull();
  });
});

describe('학교 일정 바꾸기', () => {
  it('과목이 있는 요일의 학교 일정만 바꾸고 학원 일정과 빈 요일은 그대로 둔다', async () => {
    const database = openTestDatabase();
    await migrateDatabase(database);
    const setId = (await getActiveTimetableSet(database)).id;
    await savePeriods(database, [{ periodNo: 1, startTime: '09:00', endTime: '09:40' }, { periodNo: 2, startTime: '09:50', endTime: '10:30' }]);
    await createTimetableItem(database, { weekday: 2, periodNo: 1, title: '옛 국어', category: 'school', colorKey: 'korean', iconKey: 'text', setId });
    await createTimetableItem(database, { weekday: 2, startTime: '16:00', endTime: '17:00', title: '피아노', category: 'academy', colorKey: 'academy', iconKey: 'academy', setId });
    await createTimetableItem(database, { weekday: 5, periodNo: 1, title: '금요 수학', category: 'school', colorKey: 'math', iconKey: 'number', setId });
    const created = await replaceSchoolItems(database, setId, [
      { date: '20261013', weekday: 2, entries: [{ period: 1, subject: '국어' }, { period: 2, subject: '즐거운생활' }] },
      { date: '20261016', weekday: 5, entries: [] },
    ]);
    expect(created).toBe(2);
    const items = await getEditableTimetableItems(database, setId);
    expect(items.map((item) => `${item.weekday}:${item.title}:${item.category}`).sort()).toEqual(['2:국어:school', '2:즐거운생활:school', '2:피아노:academy', '5:금요 수학:school']);
  });

  it('같은 교시·과목의 알림·메모는 옮기고, 시간으로 넣은 학교 일정과 빈 요일(공휴일)의 반복 시간표는 그대로 둔다', async () => {
    const database = openTestDatabase();
    await migrateDatabase(database);
    const setId = (await getActiveTimetableSet(database)).id;
    await savePeriods(database, [{ periodNo: 1, startTime: '09:00', endTime: '09:40' }, { periodNo: 2, startTime: '09:50', endTime: '10:30' }]);
    await createTimetableItem(database, { weekday: 2, periodNo: 1, title: '국어', category: 'school', colorKey: 'korean', iconKey: 'text', alertMode: 'notify', alertBeforeMin: 5, memo: '받아쓰기', setId });
    await createTimetableItem(database, { weekday: 2, periodNo: 2, title: '수학', category: 'school', colorKey: 'math', iconKey: 'number', memo: '바뀜', setId });
    await createTimetableItem(database, { weekday: 2, startTime: '14:00', endTime: '14:40', title: '현장학습', category: 'school', colorKey: 'other', iconKey: 'other', setId });
    await createTimetableItem(database, { weekday: 4, periodNo: 1, title: '목요 국어', category: 'school', colorKey: 'korean', iconKey: 'text', setId });
    await createTimetableItem(database, { weekday: 5, periodNo: 1, title: '금요 수학', category: 'school', colorKey: 'math', iconKey: 'number', setId });
    await replaceSchoolItems(database, setId, [
      { date: '20261013', weekday: 2, entries: [{ period: 1, subject: '국어' }, { period: 2, subject: '즐거운생활' }] },
      { date: '20261015', weekday: 4, entries: [] },
      { date: '20261016', weekday: 5, entries: [] },
    ]);
    const items = await getEditableTimetableItems(database, setId);
    expect(items.map((item) => `${item.weekday}:${item.title}:${item.alertMode}:${item.alertBeforeMin}:${item.memo}`).sort()).toEqual([
      '2:국어:notify:5:받아쓰기', '2:즐거운생활:none:0:', '2:현장학습:none:0:', '4:목요 국어:none:0:', '5:금요 수학:none:0:',
    ]);
  });
});
