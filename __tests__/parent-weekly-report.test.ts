import { buildGemWeeks, buildWeeklyReport, dayLabel, gemWeekLine, mondayOf, weekSummaryLine, type LedgerRow } from '../src/components/parentWeeklyReport';
import { toLocalDateStr } from '../src/utils/date';

jest.mock('../src/db/database', () => ({ getDatabase: jest.fn() }));

// 2026-10-08은 목요일이다. 이번 주는 10/5(월)~10/11(일).
const THURSDAY = new Date(2026, 9, 8, 20, 0);
// 장부 created_at은 SQLite UTC 문자열이다. 로컬 날짜로 묶이는지 보도록 로컬 시각을 UTC로 바꿔 만든다
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString().replace('T', ' ').slice(0, 19);
const row = (delta: number, kind: 'gem' | 'large-gem', createdAt: string): LedgerRow => ({ delta, reason: `manual-count:${kind}`, createdAt });

test('한 주는 월요일에 시작한다(일요일은 그 주의 마지막 날)', () => {
  expect(toLocalDateStr(mondayOf(THURSDAY))).toBe('2026-10-05');
  expect(toLocalDateStr(mondayOf(new Date(2026, 9, 11, 9)))).toBe('2026-10-05'); // 일요일
  expect(toLocalDateStr(mondayOf(new Date(2026, 9, 12, 0, 1)))).toBe('2026-10-12'); // 다음 월요일 0시
});

test('보석 장부를 월~일 주 단위로 끊어 주별 증감과 그 주 끝 개수를 보여 준다', () => {
  const ledger = [
    row(5, 'gem', at(2026, 9, 1)), // 4주 전보다 앞: 시작 개수에만 들어간다
    row(2, 'gem', at(2026, 9, 15)), // 9/14 주
    row(1, 'large-gem', at(2026, 9, 27)), // 9/21 주 일요일
    row(-1, 'gem', at(2026, 9, 28, 0)), // 9/28 주 월요일 0시
    row(3, 'gem', at(2026, 10, 8)), // 이번 주
  ];
  expect(buildGemWeeks(ledger, THURSDAY)).toEqual([
    { weekStart: '2026-09-14', gemChange: 2, largeGemChange: 0, gemTotal: 7, largeGemTotal: 0 },
    { weekStart: '2026-09-21', gemChange: 0, largeGemChange: 1, gemTotal: 7, largeGemTotal: 1 },
    { weekStart: '2026-09-28', gemChange: -1, largeGemChange: 0, gemTotal: 6, largeGemTotal: 1 },
    { weekStart: '2026-10-05', gemChange: 3, largeGemChange: 0, gemTotal: 9, largeGemTotal: 1 },
  ]);
});

test('장부가 비어 있으면 모든 주가 0이다', () => {
  expect(buildGemWeeks([], THURSDAY).every((week) => week.gemChange === 0 && week.gemTotal === 0 && week.largeGemTotal === 0)).toBe(true);
});

test('이번 주 완료율과 날짜별 칸 문구, 못 한 일은 아직 남았어요로 알린다', () => {
  const days = [
    { date: '2026-10-05', weekday: 1, total: 0, done: 0 },
    { date: '2026-10-06', weekday: 2, total: 3, done: 3 },
    { date: '2026-10-07', weekday: 3, total: 3, done: 1 },
  ];
  const report = buildWeeklyReport(days, [], THURSDAY);
  expect(report.weekStart).toBe('2026-10-05');
  expect(weekSummaryLine(report)).toBe('이번 주 할 일 6개 중 4개 했어요(67%). 2개가 아직 남았어요.');
  expect(days.map(dayLabel)).toEqual(['월 없음', '화 3/3 ✓', '수 1/3']);
  expect(weekSummaryLine(buildWeeklyReport([days[0]], [], THURSDAY))).toBe('이번 주에는 아직 할 일이 없었어요.');
});

test('주별 보석 한 줄은 이번 주를 따로 표시한다', () => {
  const week = { weekStart: '2026-10-05', gemChange: 3, largeGemChange: -1, gemTotal: 9, largeGemTotal: 0 };
  expect(gemWeekLine(week, true)).toBe('이번 주(10/5~): 작은 보석 +3 · 큰 보석 -1 → 작은 9개 · 큰 0개');
  expect(gemWeekLine({ ...week, gemChange: 0 }, false)).toBe('10/5 주: 작은 보석 0 · 큰 보석 -1 → 작은 9개 · 큰 0개');
});
