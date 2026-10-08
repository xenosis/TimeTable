import { getDatabase } from '../db/database';
import { getTodayTasks } from '../db/taskRepository';
import { toLocalDateStr } from '../utils/date';

/**
 * 아빠용 주간 리포트(P8.4). 사용자 결정(2026-10-09): 한 주는 월요일~일요일이고,
 * 보석 추이는 일주일 단위로 끊어 주마다 어떻게 바뀌었는지 보여 준다.
 * 아빠 폰도 로그인하면 서버 내용을 그대로 받아 두므로(P6.13) 이 폰의 DB를 읽는다.
 */
export type DayProgress = { readonly date: string; readonly weekday: number; readonly total: number; readonly done: number };
export type LedgerRow = { readonly delta: number; readonly reason: string; readonly createdAt: string };
export type GemWeek = { readonly weekStart: string; readonly gemChange: number; readonly largeGemChange: number; readonly gemTotal: number; readonly largeGemTotal: number };
export type WeeklyReport = { readonly weekStart: string; readonly days: readonly DayProgress[]; readonly done: number; readonly total: number; readonly gemWeeks: readonly GemWeek[] };

export const GEM_WEEKS = 4;

/** 그 날짜가 속한 주의 월요일(로컬 시각). */
export function mondayOf(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** 장부 created_at(SQLite UTC 'YYYY-MM-DD HH:MM:SS')을 로컬 날짜 문자열로 바꾼다. */
function ledgerLocalDate(createdAt: string): string | null {
  const time = new Date(`${createdAt.replace(' ', 'T')}Z`);
  return Number.isNaN(time.getTime()) ? null : toLocalDateStr(time);
}

const isLargeGem = (reason: string) => reason.endsWith(':large-gem');

/** 최근 몇 주(이번 주 포함, 오래된 주부터)의 주별 보석 증감과 그 주 끝의 합계. */
export function buildGemWeeks(ledger: readonly LedgerRow[], now: Date, weeks = GEM_WEEKS): GemWeek[] {
  const thisMonday = mondayOf(now);
  const starts = Array.from({ length: weeks }, (_, index) => addDays(thisMonday, (index - weeks + 1) * 7));
  const startKeys = starts.map(toLocalDateStr);
  const result = startKeys.map((weekStart) => ({ weekStart, gemChange: 0, largeGemChange: 0, gemTotal: 0, largeGemTotal: 0 }));
  let gemBefore = 0;
  let largeBefore = 0;
  for (const row of ledger) {
    const day = ledgerLocalDate(row.createdAt);
    if (day === null) continue;
    const large = isLargeGem(row.reason);
    if (day < startKeys[0]) { if (large) largeBefore += row.delta; else gemBefore += row.delta; continue; }
    // 이번 주보다 뒤(폰 시계 차이 등)는 이번 주로 센다
    let index = startKeys.length - 1;
    while (index > 0 && day < startKeys[index]) index -= 1;
    if (large) result[index].largeGemChange += row.delta; else result[index].gemChange += row.delta;
  }
  let gemTotal = gemBefore;
  let largeTotal = largeBefore;
  return result.map((week) => {
    gemTotal += week.gemChange;
    largeTotal += week.largeGemChange;
    return { ...week, gemTotal, largeGemTotal: largeTotal };
  });
}

export function buildWeeklyReport(days: readonly DayProgress[], ledger: readonly LedgerRow[], now: Date): WeeklyReport {
  return {
    weekStart: toLocalDateStr(mondayOf(now)),
    days,
    done: days.reduce((sum, day) => sum + day.done, 0),
    total: days.reduce((sum, day) => sum + day.total, 0),
    gemWeeks: buildGemWeeks(ledger, now),
  };
}

/** 이번 주 월요일부터 오늘까지의 날짜별 할 일 진행과 최근 4주 보석 장부를 읽는다. */
export async function loadWeeklyReport(now = new Date()): Promise<WeeklyReport> {
  const database = await getDatabase();
  const monday = mondayOf(now);
  const days: DayProgress[] = [];
  for (let offset = 0; offset <= (now.getDay() + 6) % 7; offset += 1) {
    const day = addDays(monday, offset);
    const date = toLocalDateStr(day);
    const tasks = await getTodayTasks(database, date, day.getDay());
    days.push({ date, weekday: day.getDay(), total: tasks.length, done: tasks.filter((task) => task.completed === 1).length });
  }
  const ledger = await database.getAllAsync<LedgerRow>("SELECT delta, reason, created_at AS createdAt FROM sticker_ledger WHERE family_id = 'local-family' ORDER BY created_at, id");
  return buildWeeklyReport(days, ledger, now);
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'] as const;
const monthDay = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);

/** 날짜별 한 칸 문구. 할 일이 없는 날은 '없음', 다 하면 '✓'. */
export function dayLabel(day: DayProgress): string {
  if (day.total === 0) return `${WEEKDAY[day.weekday]} 없음`;
  return `${WEEKDAY[day.weekday]} ${day.done}/${day.total}${day.done === day.total ? ' ✓' : ''}`;
}

/** 주간 완료율 한 줄. 못 한 일은 '아직 남았어요'로 표현한다(디자인 원칙). */
export function weekSummaryLine(report: WeeklyReport): string {
  if (report.total === 0) return '이번 주에는 아직 할 일이 없었어요.';
  const rate = Math.round((report.done / report.total) * 100);
  const left = report.total - report.done;
  return `이번 주 할 일 ${report.total}개 중 ${report.done}개 했어요(${rate}%).${left > 0 ? ` ${left}개가 아직 남았어요.` : ''}`;
}

/** 주별 보석 변화 한 줄. */
export function gemWeekLine(week: GemWeek, isThisWeek: boolean): string {
  const label = isThisWeek ? `이번 주(${monthDay(week.weekStart)}~)` : `${monthDay(week.weekStart)} 주`;
  return `${label}: 작은 보석 ${signed(week.gemChange)} · 큰 보석 ${signed(week.largeGemChange)} → 작은 ${week.gemTotal}개 · 큰 ${week.largeGemTotal}개`;
}
