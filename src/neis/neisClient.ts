/**
 * 나이스 교육정보 개방 포털(open.neis.go.kr) 조회(P8.1). 인증키는 저장소에 올리지 않는 .env의 EXPO_PUBLIC_NEIS_API_KEY로 빌드 때 넣는다.
 * 학교 시간표는 학교가 나이스에 입력한 계획 시간표라 빈칸·누락이 있을 수 있어, 화면에서 미리 보고 아빠가 확인한 뒤에만 저장한다.
 */
const BASE = 'https://open.neis.go.kr/hub';
const TIMEOUT_MS = 10_000;

export type SchoolInfo = { readonly officeCode: string; readonly schoolCode: string; readonly name: string; readonly address: string };
export type NeisTimetableRow = { readonly date: string; readonly classNo: string; readonly period: number; readonly subject: string };

type Fetcher = typeof fetch;

function apiKey(): string {
  const key = process.env.EXPO_PUBLIC_NEIS_API_KEY;
  if (!key) throw new Error('나이스 인증키가 앱에 들어 있지 않아요. 앱을 다시 빌드해 주세요.');
  return key;
}

async function request(service: string, params: Record<string, string>, fetcher: Fetcher): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams({ KEY: apiKey(), Type: 'json', pIndex: '1', pSize: '200', ...params });
  let response: Response;
  try {
    response = await fetcher(`${BASE}/${service}?${query.toString()}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new Error('나이스에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
  }
  if (!response.ok) throw new Error('나이스에서 정보를 받지 못했어요. 잠시 뒤 다시 해 주세요.');
  const body = await response.json() as Record<string, unknown>;
  const result = body.RESULT as { CODE?: string } | undefined;
  // INFO-200: 해당하는 데이터가 없음
  if (result?.CODE === 'INFO-200') return [];
  if (result?.CODE) throw new Error('나이스에서 정보를 받지 못했어요. 잠시 뒤 다시 해 주세요.');
  const sections = body[service] as [unknown, { row?: Record<string, unknown>[] }] | undefined;
  return sections?.[1]?.row ?? [];
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** 학교 이름으로 초등학교를 찾는다. */
export async function searchElementarySchools(name: string, fetcher: Fetcher = fetch): Promise<SchoolInfo[]> {
  const keyword = name.trim();
  if (keyword.length < 2) throw new Error('학교 이름을 두 글자 이상 적어 주세요.');
  const rows = await request('schoolInfo', { SCHUL_NM: keyword, SCHUL_KND_SC_NM: '초등학교' }, fetcher);
  return rows.map((row) => ({ officeCode: text(row.ATPT_OFCDC_SC_CODE), schoolCode: text(row.SD_SCHUL_CODE), name: text(row.SCHUL_NM), address: text(row.ORG_RDNMA) }))
    .filter((school) => school.officeCode && school.schoolCode && school.name);
}

/** 한 반의 기간 시간표(YYYYMMDD~YYYYMMDD)를 읽는다. 과목이 빈 칸도 그대로 돌려준다(공휴일 판단에 쓴다). */
export async function fetchClassTimetable(school: Pick<SchoolInfo, 'officeCode' | 'schoolCode'>, grade: number, classNo: string, from: string, to: string, fetcher: Fetcher = fetch): Promise<NeisTimetableRow[]> {
  const rows = await request('elsTimetable', {
    ATPT_OFCDC_SC_CODE: school.officeCode, SD_SCHUL_CODE: school.schoolCode, GRADE: String(grade), CLASS_NM: classNo, TI_FROM_YMD: from, TI_TO_YMD: to,
  }, fetcher);
  return rows.map((row) => ({ date: text(row.ALL_TI_YMD), classNo: text(row.CLASS_NM), period: Number(row.PERIO), subject: text(row.ITRT_CNTNT) }))
    .filter((row) => /^\d{8}$/.test(row.date) && Number.isInteger(row.period) && row.period > 0);
}

/** 학사일정의 쉬는 평일. holiday: 공휴일(학교·학원 모두 쉼), school-off: 재량휴업일·개교기념일 등(학교만 쉼). */
export type SchoolHoliday = { readonly name: string; readonly kind: 'holiday' | 'school-off' };

/**
 * 학사일정에서 수업이 없는 평일을 날짜(YYYYMMDD) → 쉬는 날로 읽는다. 주말(토요휴업일)은 뺀다.
 * 여름·겨울방학도 나이스에는 날마다 '휴업일'로 오지만 방학에도 학원·돌봄은 가므로 넣지 않는다(방학은 방학 시간표 세트로 관리한다).
 * 같은 날 공휴일과 휴업일이 겹치면 공휴일로 본다.
 */
export async function fetchSchoolHolidays(school: Pick<SchoolInfo, 'officeCode' | 'schoolCode'>, from: string, to: string, fetcher: Fetcher = fetch): Promise<Map<string, SchoolHoliday>> {
  const rows = await request('SchoolSchedule', { ATPT_OFCDC_SC_CODE: school.officeCode, SD_SCHUL_CODE: school.schoolCode, AA_FROM_YMD: from, AA_TO_YMD: to }, fetcher);
  const holidays = new Map<string, SchoolHoliday>();
  for (const row of rows) {
    const date = text(row.AA_YMD);
    const name = text(row.EVENT_NM) || '쉬는 날';
    const type = text(row.SBTR_DD_SC_NM);
    if (!/^\d{8}$/.test(date) || (type !== '공휴일' && type !== '휴업일') || (type === '휴업일' && name.includes('방학'))) continue;
    const weekday = new Date(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8))).getDay();
    if (weekday === 0 || weekday === 6 || holidays.get(date)?.kind === 'holiday') continue;
    holidays.set(date, { name, kind: type === '공휴일' ? 'holiday' : 'school-off' });
  }
  return holidays;
}

/** 한 끼 급식. dishes는 나이스 원문 그대로(알레르기 번호 포함)이고, 화면용 정리는 meals.ts가 한다. */
export type NeisMeal = { readonly date: string; readonly kind: string; readonly dishes: readonly string[]; readonly calories: string };

/** 학교 급식 식단(YYYYMMDD~YYYYMMDD)을 읽는다(P8.2). 급식이 없는 날(주말·방학)은 행이 없다. */
export async function fetchMeals(school: Pick<SchoolInfo, 'officeCode' | 'schoolCode'>, from: string, to: string, fetcher: Fetcher = fetch): Promise<NeisMeal[]> {
  const rows = await request('mealServiceDietInfo', { ATPT_OFCDC_SC_CODE: school.officeCode, SD_SCHUL_CODE: school.schoolCode, MLSV_FROM_YMD: from, MLSV_TO_YMD: to }, fetcher);
  return rows.map((row) => ({ date: text(row.MLSV_YMD), kind: text(row.MMEAL_SC_NM) || '중식', dishes: text(row.DDISH_NM).split(/<br\s*\/?>/i).map((dish) => dish.trim()).filter(Boolean), calories: text(row.CAL_INFO) }))
    .filter((meal) => /^\d{8}$/.test(meal.date) && meal.dishes.length > 0);
}
