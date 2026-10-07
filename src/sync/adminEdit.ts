import { getDatabase } from '../db/database';
import type { RewardDatabase } from '../db/rewardRepository';
import { withRewardQueue } from '../db/rewardQueue';
import { getSupabase } from '../server/supabaseClient';
import { getAccount } from '../store/accountStore';
import { buildReplaceScript, childOwnedTables, NETWORK_ERROR } from './pullSnapshot';
import { snapshotTables, type LocalRow, type LocalSnapshot, type LocalTable } from './snapshotMapping';
import { hasSyncedFamily, markAdminEdit } from './syncMarkers';
import { syncTarget } from './syncRunner';
import { requestSyncSoon } from './syncSoon';
import { withSyncLock } from './syncLock';
import { toIso } from './pushChildRecords';
import { notifyParentEditSaved } from '../push/familyPush';

/**
 * 로그인한 폰의 관리자 편집을 서버에 먼저 저장한다(P6.15). 편집 함수(검증 규칙 포함)는 지금처럼 로컬에서 실행하고,
 * 실행 전후 '가족 데이터' 테이블을 비교해 바뀐 행을 서버 함수 tt_apply_family_edit에 한 번에 보낸다(한 트랜잭션).
 * 서버가 거부하거나 인터넷이 없으면 가족 데이터 테이블만 편집 전으로 되돌린다(그 사이 생긴 체크·보석 기록은 지킨다).
 * 새로 만든 행은 로컬 id를 서버 id로 쓰되 덮어쓰지 않는다(다른 기기가 같은 id를 먼저 만들었으면 서버가 거부한다).
 * 로그인하지 않은 로컬 모드는 지금처럼 로컬에만 저장한다. 로그인했지만 아직 서버와 맞추지 않은 폰은 편집을 막는다.
 */
export const parentTables = ['periods', 'timetable_sets', 'timetable_settings', 'timetable_items', 'day_exceptions', 'tasks', 'rewards'] as const satisfies readonly LocalTable[];
type ParentTable = (typeof parentTables)[number];
type Row = LocalRow;
type ParentRows = Partial<Record<LocalTable, readonly Row[]>>;

export type ParentDiff = { readonly table: ParentTable; readonly inserts: readonly Row[]; readonly updates: readonly Row[]; readonly deletes: readonly number[] };

const keyOf = (table: ParentTable, row: Row): string => (table === 'timetable_settings' ? String(row.family_id) : String(row.id));
const same = (a: Row, b: Row) => Object.keys(a).every((column) => a[column] === b[column]);

/** 편집 전후 로컬 행 비교. 새 행은 inserts, 바뀐 행은 updates, 사라진 행은 deletes(id). */
export function diffParentTables(before: ParentRows, after: ParentRows): ParentDiff[] {
  return parentTables.map((table) => {
    const old = new Map((before[table] ?? []).map((row) => [keyOf(table, row), row]));
    const next = new Map((after[table] ?? []).map((row) => [keyOf(table, row), row]));
    const inserts: Row[] = [];
    const updates: Row[] = [];
    for (const [key, row] of next) {
      const prev = old.get(key);
      if (!prev) inserts.push(row);
      else if (!same(prev, row)) updates.push(row);
    }
    const deletes = table === 'timetable_settings' ? [] : [...old.keys()].filter((key) => !next.has(key)).map(Number);
    return { table, inserts, updates, deletes };
  }).filter((diff) => diff.inserts.length + diff.updates.length + diff.deletes.length > 0);
}

const csvToArray = (value: Row[string]): number[] | null => (typeof value === 'string' && value.trim() ? value.split(',').map(Number) : null);

/** 로컬 행 → 서버 행. 가족은 서버 함수가 정하고, 시각은 ISO로, 반복 요일은 배열로 바꾼다. 서버에 없는 옛 열은 뺀다. */
export function toServerRow(table: Exclude<ParentTable, 'timetable_settings'>, row: Row): Record<string, unknown> {
  switch (table) {
    case 'periods': return { id: row.id, period_no: row.period_no, start_time: row.start_time, end_time: row.end_time, created_at: toIso(row.created_at) };
    case 'timetable_sets': return { id: row.id, name: row.name, created_at: toIso(row.created_at) };
    case 'timetable_items': return {
      id: row.id, set_id: row.set_id, weekday: row.weekday, period_no: row.period_no, start_time: row.start_time, end_time: row.end_time,
      title: row.title, category: row.category, color_key: row.color_key, icon_key: row.icon_key, alert_mode: row.alert_mode, alert_before_min: row.alert_before_min,
      memo: row.memo ?? '', created_at: toIso(row.created_at),
    };
    case 'day_exceptions': return { id: row.id, start_date: row.start_date, end_date: row.end_date, type: row.type, note: row.note ?? '' };
    case 'tasks': return {
      id: row.id, title: row.title, repeat_weekdays: csvToArray(row.repeat_weekdays), task_date: row.task_date, remind_time: row.remind_time,
      alert_mode: row.alert_mode, sticker_reward: row.sticker_reward, effective_from: row.effective_from, effective_until: row.effective_until, created_at: toIso(row.created_at),
    };
    case 'rewards': return { id: row.id, title: row.title, sticker_goal: row.sticker_goal, achieved_at: toIso(row.achieved_at) };
  }
}

/** 서버 함수 tt_apply_family_edit에 보낼 묶음. */
export function buildEditPayload(diffs: readonly ParentDiff[]): Record<string, unknown> {
  const deletes: Record<string, number[]> = {};
  const inserts: Record<string, unknown[]> = {};
  const updates: Record<string, unknown[]> = {};
  let settings: Record<string, unknown> | null = null;
  for (const diff of diffs) {
    if (diff.table === 'timetable_settings') {
      const row = diff.inserts[0] ?? diff.updates[0];
      if (row) settings = { active_set_id: row.active_set_id };
      continue;
    }
    const name = `tt_${diff.table}`;
    if (diff.deletes.length) deletes[name] = [...diff.deletes];
    if (diff.inserts.length) inserts[name] = diff.inserts.map((row) => toServerRow(diff.table as Exclude<ParentTable, 'timetable_settings'>, row));
    if (diff.updates.length) updates[name] = diff.updates.map((row) => toServerRow(diff.table as Exclude<ParentTable, 'timetable_settings'>, row));
  }
  return { deletes, inserts, updates, settings };
}

async function readParentRows(database: Pick<RewardDatabase, 'getAllAsync'>): Promise<Record<ParentTable, Row[]>> {
  const entries = await Promise.all(parentTables.map(async (table) => [table, await database.getAllAsync<Row>(`SELECT * FROM ${table}`)] as const));
  return Object.fromEntries(entries) as Record<ParentTable, Row[]>;
}

/** 가족 데이터 테이블만 편집 전으로 되돌리고, 체크·보석 기록은 지금 것을 지킨다(되돌리는 사이 생긴 체크가 사라지지 않게). */
async function revertParentTables(database: RewardDatabase, before: Record<ParentTable, Row[]>): Promise<void> {
  await withRewardQueue(async () => {
    const current = Object.fromEntries(await Promise.all(childOwnedTables.map(async (table) => [table, await database.getAllAsync<Row>(`SELECT * FROM ${table}`)] as const)));
    const snapshot = Object.fromEntries(snapshotTables.map(([, table]) => [table, (before as Record<string, Row[]>)[table] ?? current[table] ?? []])) as unknown as LocalSnapshot;
    try { await database.execAsync(buildReplaceScript(snapshot, current as never)); } catch { await database.execAsync('ROLLBACK').catch(() => undefined); }
  });
}

export const OFFLINE_EDIT_MESSAGE = '인터넷 연결이 필요해요. 바꾼 내용은 저장하지 않았어요.';
export const NOT_SYNCED_MESSAGE = '아직 서버와 맞추지 않았어요. 관리자 설정의 서버 연결에서 서버와 맞춘 뒤 바꿔 주세요.';

export function editErrorMessage(message: string): string {
  const reason = /TT_EDIT: (.+)$/.exec(message)?.[1];
  if (reason) return `${reason} 바꾼 내용은 저장하지 않았어요.`;
  if (message === NETWORK_ERROR || /network|fetch|timed? ?out/i.test(message)) return OFFLINE_EDIT_MESSAGE;
  return '서버에 저장하지 못했어요. 바꾼 내용은 저장하지 않았어요. 잠시 뒤 다시 해 주세요.';
}

export async function runAdminEdit<T>(action: () => Promise<T>): Promise<T> {
  const target = syncTarget(getAccount());
  if (!target) return action(); // 로컬 모드: 지금과 같다
  if (!hasSyncedFamily(target.familyId)) throw new Error(NOT_SYNCED_MESSAGE);
  // 동기화와 겹치지 않게 같은 줄에서 편집 → 비교 → 서버 저장을 끝낸다
  let saved = false;
  const result = await withSyncLock(async () => {
    const database = await getDatabase();
    const before = await readParentRows(database);
    const value = await action();
    const diffs = diffParentTables(before, await readParentRows(database));
    if (diffs.length === 0) return value;
    let failure: string | null = null;
    try {
      const { error } = await getSupabase().rpc('tt_apply_family_edit', { p_family: target.familyId, p_edit: buildEditPayload(diffs) });
      if (error) failure = error.message;
    } catch (error) {
      failure = error instanceof Error ? error.message : '';
    }
    if (failure !== null) {
      await revertParentTables(database, before);
      throw new Error(editErrorMessage(failure));
    }
    markAdminEdit(target.familyId, new Date().toISOString());
    saved = true;
    return value;
  });
  requestSyncSoon(); // 서버 내용으로 다시 맞추고(다른 기기 변경 포함) 알림·위젯을 갱신한다
  if (saved) void notifyParentEditSaved(target.familyId).catch(() => console.warn('TimeTable: 내용은 저장됐지만 변경 알림을 보내지 못했어요.'));
  return result;
}
