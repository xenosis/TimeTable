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

/** 학사일정에서 수업이 없는 평일(공휴일·휴업일)을 날짜(YYYYMMDD) → 행사 이름(예: '한글날')으로 읽는다. 주말 토요휴업일은 뺀다. */
export async function fetchSchoolHolidays(school: Pick<SchoolInfo, 'officeCode' | 'schoolCode'>, from: string, to: string, fetcher: Fetcher = fetch): Promise<Map<string, string>> {
  const rows = await request('SchoolSchedule', { ATPT_OFCDC_SC_CODE: school.officeCode, SD_SCHUL_CODE: school.schoolCode, AA_FROM_YMD: from, AA_TO_YMD: to }, fetcher);
  const holidays = new Map<string, string>();
  for (const row of rows) {
    const date = text(row.AA_YMD);
    if (!/^\d{8}$/.test(date) || !['공휴일', '휴업일'].includes(text(row.SBTR_DD_SC_NM))) continue;
    const weekday = new Date(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8))).getDay();
    if (weekday === 0 || weekday === 6 || holidays.has(date)) continue;
    holidays.set(date, text(row.EVENT_NM) || '쉬는 날');
  }
  return holidays;
}
