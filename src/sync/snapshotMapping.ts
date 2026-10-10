/**
 * 서버(tt_ 테이블) 행을 로컬 SQLite 행으로 바꾼다(동기화 P6.13). 화면·알림·위젯 코드는 지금처럼 로컬 SQLite만 읽는다.
 * - id는 서버 id를 그대로 쓴다. 그래야 이후 체크 기록(P6.14)이 서버의 할 일을 같은 id로 가리킨다.
 * - 가족·딸은 로컬에서 늘 'local-family'·'local-child'로 둔다(저장소 코드가 이 값을 고정으로 쓴다).
 * - 서버 시각(ISO, 시간대 포함)은 로컬과 같은 SQLite UTC 문자열 'YYYY-MM-DD HH:MM:SS'로, 반복 요일 배열은 '1,3,5' 문자열로 바꾼다.
 */
export const LOCAL_FAMILY = 'local-family';
export const LOCAL_CHILD = 'local-child';

type Row = Record<string, unknown>;

/** 서버 테이블 → 로컬 테이블. 받아오는 순서이기도 하다(참조되는 쪽 먼저). */
export const snapshotTables = [
  ['tt_periods', 'periods'],
  ['tt_timetable_sets', 'timetable_sets'],
  ['tt_timetable_settings', 'timetable_settings'],
  ['tt_timetable_items', 'timetable_items'],
  ['tt_day_exceptions', 'day_exceptions'],
  ['tt_tasks', 'tasks'],
  ['tt_task_completions', 'task_completions'],
  ['tt_task_completion_history', 'task_completion_history'],
  ['tt_sticker_ledger', 'sticker_ledger'],
  ['tt_rewards', 'rewards'],
  ['tt_gem_rights', 'gem_rights'],
] as const;
export type ServerTable = (typeof snapshotTables)[number][0];
export type LocalTable = (typeof snapshotTables)[number][1];
export type ServerSnapshot = Readonly<Record<ServerTable, readonly Row[]>>;
export type LocalRow = Readonly<Record<string, string | number | null>>;
export type LocalSnapshot = Readonly<Record<LocalTable, readonly LocalRow[]>>;

/** ISO 시각 → SQLite UTC 문자열. 값이 없으면 null. */
export function toSqliteUtc(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return null;
  return time.toISOString().slice(0, 19).replace('T', ' ');
}

/** 서버 smallint[] → 로컬 CSV. 배열이 아니면 null(특정 날짜 할 일). */
export function toWeekdayCsv(value: unknown): string | null {
  return Array.isArray(value) && value.length > 0 ? value.map(Number).join(',') : null;
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null => (value === null || value === undefined || value === '' ? null : Number(value));
const textOr = (value: unknown, fallback: string): string => text(value) ?? fallback;
const createdAt = (row: Row): string => toSqliteUtc(row.created_at) ?? toSqliteUtc(new Date().toISOString())!;

const mappers: Readonly<Record<LocalTable, (row: Row) => LocalRow>> = {
  periods: (r) => ({ id: num(r.id), family_id: LOCAL_FAMILY, period_no: num(r.period_no), start_time: text(r.start_time), end_time: text(r.end_time), created_at: createdAt(r) }),
  timetable_sets: (r) => ({ id: num(r.id), family_id: LOCAL_FAMILY, name: text(r.name), created_at: createdAt(r) }),
  timetable_settings: (r) => ({
    family_id: LOCAL_FAMILY, active_set_id: num(r.active_set_id), school_office_code: text(r.school_office_code), school_code: text(r.school_code),
    school_name: text(r.school_name), school_grade: num(r.school_grade), school_class: text(r.school_class),
  }),
  timetable_items: (r) => ({
    id: num(r.id), family_id: LOCAL_FAMILY, set_id: num(r.set_id), weekday: num(r.weekday), period_no: num(r.period_no),
    start_time: text(r.start_time), end_time: text(r.end_time), title: text(r.title), category: text(r.category),
    color_key: text(r.color_key), icon_key: text(r.icon_key), alert_mode: textOr(r.alert_mode, 'none'),
    alert_before_min: num(r.alert_before_min) ?? 0, memo: textOr(r.memo, ''), created_at: createdAt(r),
  }),
  day_exceptions: (r) => ({ id: num(r.id), family_id: LOCAL_FAMILY, start_date: text(r.start_date), end_date: text(r.end_date), type: text(r.type), note: textOr(r.note, '') }),
  tasks: (r) => {
    const repeatWeekdays = toWeekdayCsv(r.repeat_weekdays);
    const created = createdAt(r);
    // 로컬 조회는 반복 할 일의 시작일(effective_from)이 있어야 목록에 넣는다. 서버에서 비워 만들었으면 로컬 V6처럼 만든 날로 채운다
    const effectiveFrom = text(r.effective_from) ?? (repeatWeekdays ? created.slice(0, 10) : null);
    return {
      id: num(r.id), family_id: LOCAL_FAMILY, title: text(r.title), repeat_weekdays: repeatWeekdays, task_date: text(r.task_date),
      remind_time: text(r.remind_time), alert_mode: textOr(r.alert_mode, 'none'), sticker_reward: num(r.sticker_reward),
      effective_from: effectiveFrom, effective_until: text(r.effective_until), created_at: created,
    };
  },
  task_completions: (r) => ({ id: num(r.id), task_id: num(r.task_id), completion_date: text(r.completion_date), done_at: toSqliteUtc(r.done_at) ?? createdAt({}), done_by: textOr(r.done_by, 'child') }),
  task_completion_history: (r) => ({ task_id: num(r.task_id), completion_date: text(r.completion_date) }),
  sticker_ledger: (r) => ({ id: num(r.id), family_id: LOCAL_FAMILY, child_id: LOCAL_CHILD, delta: num(r.delta), reason: text(r.reason), task_id: num(r.task_id), created_at: createdAt(r) }),
  rewards: (r) => ({ id: num(r.id), family_id: LOCAL_FAMILY, title: text(r.title), sticker_goal: num(r.sticker_goal), achieved_at: toSqliteUtc(r.achieved_at) }),
  gem_rights: (r) => ({
    id: num(r.id), family_id: LOCAL_FAMILY, child_id: LOCAL_CHILD, earned_date: text(r.earned_date), state: textOr(r.state, 'available'),
    requested_at: toSqliteUtc(r.requested_at), given_at: toSqliteUtc(r.given_at), created_at: createdAt(r),
  }),
};

export function toLocalSnapshot(server: ServerSnapshot): LocalSnapshot {
  return Object.fromEntries(snapshotTables.map(([serverTable, localTable]) => [localTable, (server[serverTable] ?? []).map(mappers[localTable])])) as unknown as LocalSnapshot;
}
