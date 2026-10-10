import { cleanDish, loadTodayMeal, weekRange } from '../src/neis/meals';

const mockStore = new Map<string, string>();
jest.mock('expo-sqlite/kv-store', () => ({ __esModule: true, default: {
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { mockStore.set(key, value); },
} }));
const mockProfile = jest.fn();
jest.mock('../src/neis/schoolProfile', () => ({ loadSchoolProfile: () => mockProfile() }));
const mockMeals = jest.fn();
jest.mock('../src/neis/neisClient', () => ({ fetchMeals: (...args: unknown[]) => mockMeals(...args) }));

const school = { officeCode: 'J10', schoolCode: '7591095', schoolName: '빛가온초등학교', grade: 2, classNo: '6' };
// 2026-10-13은 화요일
const TUESDAY = new Date(2026, 9, 13, 8, 0);
const lunch = (date: string, dishes: string[], kind = '중식') => ({ date, kind, dishes, calories: '700.1 Kcal' });

beforeEach(() => { mockStore.clear(); mockProfile.mockReset(); mockMeals.mockReset(); mockProfile.mockResolvedValue(school); });

test('메뉴 이름에서 알레르기 번호와 학교 표시 기호를 뗀다', () => {
  expect(cleanDish('미니김밥 (1.2.5.6.10)')).toBe('미니김밥');
  expect(cleanDish('치커리사과초무침(a) (5.6.13)')).toBe('치커리사과초무침');
  expect(cleanDish('칼슘쌀밥ㅅ ')).toBe('칼슘쌀밥');
  expect(cleanDish('양송이크림스프(동) (2.5.6.13.16)')).toBe('양송이크림스프');
  expect(cleanDish('한글날케이크ㄱ (1.2.5.6)')).toBe('한글날케이크');
  expect(cleanDish('비타민과일샐러드(A) (11.12.13)')).toBe('비타민과일샐러드');
});

test('주는 월요일부터 일요일까지다', () => {
  expect(weekRange(TUESDAY)).toEqual(['20261012', '20261018']);
  expect(weekRange(new Date(2026, 9, 18))).toEqual(['20261012', '20261018']); // 일요일
});

test('이번 주 급식을 하루 한 번 받아 오늘 점심을 보여 주고, 같은 날 다시 열면 묻지 않는다', async () => {
  mockMeals.mockResolvedValue([lunch('20261013', ['칼슘쌀밥ㅅ ', '쇠고기미역국ㅅ (5.6.16)']), lunch('20261014', ['카레'])]);
  expect(await loadTodayMeal(TUESDAY)).toEqual({ status: 'ready', kind: '중식', dishes: ['칼슘쌀밥', '쇠고기미역국'], calories: '700.1 Kcal' });
  expect(mockMeals).toHaveBeenCalledWith(school, '20261012', '20261018');
  await loadTodayMeal(new Date(2026, 9, 13, 15, 0));
  expect(mockMeals).toHaveBeenCalledTimes(1);
  expect(await loadTodayMeal(new Date(2026, 9, 14, 8, 0))).toMatchObject({ dishes: ['카레'] }); // 다음 날은 새로 받는다
  expect(mockMeals).toHaveBeenCalledTimes(2);
});

test('급식이 없는 날, 학교를 정하지 않은 폰, 인터넷이 안 될 때', async () => {
  mockMeals.mockResolvedValue([lunch('20261014', ['카레'])]);
  expect(await loadTodayMeal(TUESDAY)).toEqual({ status: 'none' });
  // 같은 주 보관본이 있으면 인터넷이 안 돼도 그것을 쓴다
  mockMeals.mockRejectedValue(new Error('나이스에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'));
  expect(await loadTodayMeal(new Date(2026, 9, 14, 8, 0))).toMatchObject({ status: 'ready', dishes: ['카레'] });
  // 다른 주는 보관본이 없어 오류로 알린다
  expect(await loadTodayMeal(new Date(2026, 9, 20, 8, 0))).toEqual({ status: 'error', message: '나이스에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.' });
  mockProfile.mockResolvedValue(null);
  expect(await loadTodayMeal(TUESDAY)).toEqual({ status: 'no-school' });
});

test('점심이 없고 다른 끼니만 있으면 그 끼니를 보인다', async () => {
  mockMeals.mockResolvedValue([lunch('20261013', ['우유'], '조식')]);
  expect(await loadTodayMeal(TUESDAY)).toMatchObject({ status: 'ready', kind: '조식', dishes: ['우유'] });
});
