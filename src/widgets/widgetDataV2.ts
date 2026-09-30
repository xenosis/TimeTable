import { getTodayTasks } from '../db/taskRepository';
import { getTimetableItemsForWeekday } from '../db/timetableRepository';
import { getActiveTimetableSet } from '../db/timetableSetRepository';
import type { TimetableDatabase } from '../db/types';
import { resolveThemeColor, type ThemeDefinition } from '../theme';
import { toLocalDateStr } from '../utils/date';

/** 앱이 오늘부터 이만큼의 날짜를 미리 써 두면, 앱을 열지 않아도 위젯이 그날 것을 골라 쓸 수 있다. */
export const WIDGET_DAYS = 7;
export const WIDGET_MAX_BYTES = 64 * 1024;
const MAX_TITLE_LENGTH = 60;
/** 하루에 담는 최대 개수. 이 상한이면 최악의 경우에도 약 55KB라 64KB 상한을 넘지 않는다(테스트로 확인). */
const LIMITS = { schedule: 20, tasks: 10 } as const;

export type WidgetScheduleItem = {
  readonly title: string;
  readonly startTime: string;
  readonly endTime: string;
  /** 과목 표식 색(대비가 보장된 테마 값) */
  readonly backgroundColor: string;
  readonly textColor: string;
};

export type WidgetTask = { readonly id: number; readonly title: string; readonly completed: boolean };

export type WidgetDay = {
  /** YYYY-MM-DD (기기 로컬 날짜) */
  readonly date: string;
  /** 0=일 ~ 6=토 */
  readonly weekday: number;
  readonly schedule: readonly WidgetScheduleItem[];
  readonly tasks: readonly WidgetTask[];
  /** 하루 상한을 넘어 담지 못한 개수. 0이 아니면 위젯이 '+N개'로 알려 '다 했다'로 오해하지 않게 한다. */
  readonly hiddenScheduleCount: number;
  readonly hiddenTaskCount: number;
};

export type WidgetDataV2 = {
  readonly schemaVersion: 2;
  readonly updatedAt: string;
  /** 이 데이터가 기준으로 삼은 시간표 이름(예: 1학기) */
  readonly timetableName: string;
  readonly theme: { readonly background: string; readonly surface: string; readonly text: string; readonly textMuted: string; readonly primary: string; readonly onPrimary: string; readonly border: string };
  readonly days: readonly WidgetDay[];
};

/** 글자 단위(이모지 포함)로 자른다. UTF-16 단위로 자르면 이모지가 반쪽이 되어 깨진 글자가 위젯에 보인다. */
function shorten(title: string): string {
  const characters = Array.from(title);
  return characters.length > MAX_TITLE_LENGTH ? `${characters.slice(0, MAX_TITLE_LENGTH - 1).join('')}…` : title;
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

function byteLength(data: WidgetDataV2): number {
  return new TextEncoder().encode(JSON.stringify(data)).length;
}

/**
 * 적용 중인 시간표의 일정과 할 일을 오늘부터 7일치 날짜별로 만든다.
 * 하루 항목 수에 상한을 두고, 그래도 용량 상한(64KB)을 넘으면 오류를 던진다(조용히 잘라 잘못된 정보를 보이지 않기 위해).
 */
export async function buildWidgetData(database: TimetableDatabase, theme: ThemeDefinition, now: Date = new Date()): Promise<WidgetDataV2> {
  const set = await getActiveTimetableSet(database);
  const days: WidgetDay[] = [];
  for (let offset = 0; offset < WIDGET_DAYS; offset += 1) {
    const day = addDays(now, offset);
    const date = toLocalDateStr(day);
    const weekday = day.getDay();
    // 정규 수업(학교)은 아이가 이미 아는 시간이라 위젯에서 뺀다. 수업 뒤 방과후·학원이 헷갈리는 것을 막는 게 이 앱의 목적이다.
    const items = (await getTimetableItemsForWeekday(database, weekday, set.id)).filter((item) => item.category !== 'school');
    const tasks = await getTodayTasks(database, date, weekday);
    days.push({
      date,
      weekday,
      schedule: items.slice(0, LIMITS.schedule).map((item) => {
        const color = resolveThemeColor(theme, item.colorKey);
        return { title: shorten(item.title), startTime: item.startTime, endTime: item.endTime, backgroundColor: color.backgroundColor, textColor: color.textColor };
      }),
      tasks: tasks.slice(0, LIMITS.tasks).map((task) => ({ id: task.id, title: shorten(task.title), completed: task.completed === 1 })),
      hiddenScheduleCount: Math.max(0, items.length - LIMITS.schedule),
      hiddenTaskCount: Math.max(0, tasks.length - LIMITS.tasks),
    });
  }
  const { colors } = theme;
  const data: WidgetDataV2 = {
    schemaVersion: 2,
    updatedAt: now.toISOString(),
    timetableName: shorten(set.name),
    theme: { background: colors.background, surface: colors.surface, text: colors.text, textMuted: colors.textMuted, primary: colors.primary, onPrimary: colors.onPrimary, border: colors.border },
    days,
  };
  if (byteLength(data) > WIDGET_MAX_BYTES) throw new Error('위젯 데이터가 너무 커요.');
  return data;
}
