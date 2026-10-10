import { scheduleSemanticDefaults, type ColorKey, type IconKey } from '../theme';
import type { TimetableDatabase, TimetableSetId } from '../db/types';
import { createTimetableItem } from '../db/timetableRepository';
import { toLocalDateStr } from '../utils/date';
import type { NeisTimetableRow } from './neisClient';

/** 한 요일의 학교 시간표(교시 순). 과목이 비어 있으면(공휴일 등) entries가 비어 있다. */
export type WeekdayPlan = { readonly date: string; readonly weekday: number; readonly entries: readonly { readonly period: number; readonly subject: string }[] };

/** 과목 이름으로 앱의 과목 색·아이콘을 고른다. 통합교과(바른·슬기로운·즐거운생활)와 창의적 체험활동은 '기타'다. */
export function subjectStyle(subject: string): { readonly colorKey: ColorKey; readonly iconKey: IconKey } {
  const rules: [RegExp, keyof typeof scheduleSemanticDefaults][] = [
    [/국어/, 'korean'], [/수학/, 'math'], [/영어/, 'english'], [/과학/, 'science'],
    [/음악/, 'music'], [/미술/, 'art'], [/체육/, 'physical-education'],
  ];
  const key = rules.find(([pattern]) => pattern.test(subject))?.[1] ?? 'other';
  return scheduleSemanticDefaults[key];
}

/** 월~금 날짜(YYYYMMDD). 기준일이 속한 주의 월요일부터 시작한다(주말이면 다음 주 월요일). */
export function schoolWeekDates(base: Date, nextWeek: boolean): string[] {
  const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const day = monday.getDay();
  monday.setDate(monday.getDate() - ((day + 6) % 7) + (day === 0 || day === 6 ? 7 : 0) + (nextWeek ? 7 : 0));
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return toLocalDateStr(date).replaceAll('-', '');
  });
}

/** 나이스 행을 요일별 교시 목록으로 묶는다. 같은 교시가 여러 번 오면 첫 과목만 쓴다. */
export function buildWeekPlan(rows: readonly NeisTimetableRow[], dates: readonly string[]): WeekdayPlan[] {
  return dates.map((date) => {
    const weekday = new Date(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8))).getDay();
    const byPeriod = new Map<number, string>();
    for (const row of rows) if (row.date === date && row.subject && !byPeriod.has(row.period)) byPeriod.set(row.period, row.subject);
    return { date, weekday, entries: [...byPeriod.entries()].sort(([a], [b]) => a - b).map(([period, subject]) => ({ period, subject })) };
  });
}

/** 가져올 수 있는지 확인: 교시 시간이 정해지지 않은 교시가 있으면 그 번호를 돌려준다. */
export function missingPeriods(plan: readonly WeekdayPlan[], definedPeriods: readonly number[]): number[] {
  const defined = new Set(definedPeriods);
  return [...new Set(plan.flatMap((day) => day.entries.map((entry) => entry.period)))].filter((period) => !defined.has(period)).sort((a, b) => a - b);
}

type KeptSettings = { readonly alertMode: 'none' | 'notify' | 'alarm'; readonly alertBeforeMin: number; readonly memo: string };

/**
 * 과목이 있는 요일만 그 요일의 교시 '학교' 일정을 나이스 시간표로 바꾼다. 학원·돌봄·생활 일정, 시간으로 넣은 학교 일정과
 * 빈 요일(공휴일 등)은 그대로 둔다. 공휴일은 매주 반복 시간표를 지우지 않고 날짜별 휴일로 그날만 숨긴다(P8.8).
 * 같은 교시·같은 과목이 다시 오면 그 칸에 넣어 둔 알림·메모는 그대로 옮긴다.
 * 로그인한 폰에서는 호출하는 쪽이 runAdminEdit로 감싸 서버에 먼저 저장한다.
 */
export async function replaceSchoolItems(database: Pick<TimetableDatabase, 'execAsync' | 'runAsync' | 'getAllAsync'>, setId: TimetableSetId, plan: readonly WeekdayPlan[]): Promise<number> {
  let created = 0;
  // 중간에 실패하면 앞 요일만 바뀐 채 남지 않도록 한 번에 저장하거나 모두 되돌린다(P8.1 리뷰)
  await database.execAsync('BEGIN IMMEDIATE');
  try {
    for (const day of plan) {
      if (day.entries.length === 0) continue;
      const where = "family_id = 'local-family' AND set_id = ? AND weekday = ? AND category = 'school' AND period_no IS NOT NULL";
      const previous = await database.getAllAsync<{ periodNo: number; title: string } & KeptSettings>(
        `SELECT period_no AS periodNo, title, alert_mode AS alertMode, alert_before_min AS alertBeforeMin, memo FROM timetable_items WHERE ${where}`, setId, day.weekday,
      );
      const kept = new Map(previous.map((row) => [`${row.periodNo}=${row.title}`, row]));
      await database.runAsync(`DELETE FROM timetable_items WHERE ${where}`, setId, day.weekday);
      for (const entry of day.entries) {
        const old = kept.get(`${entry.period}=${entry.subject}`);
        await createTimetableItem(database, {
          weekday: day.weekday, periodNo: entry.period, title: entry.subject, category: 'school', ...subjectStyle(entry.subject), setId,
          alertMode: old?.alertMode ?? 'none', alertBeforeMin: old?.alertBeforeMin ?? 0, memo: old?.memo ?? '',
        });
        created += 1;
      }
    }
    await database.execAsync('COMMIT');
  } catch (error) {
    await database.execAsync('ROLLBACK').catch(() => undefined);
    throw error;
  }
  return created;
}
