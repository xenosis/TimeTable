import { getDatabase } from '../db/database';
import type { RewardDatabase } from '../db/rewardRepository';
import { withRewardQueue } from '../db/rewardQueue';
import { getSupabase } from '../server/supabaseClient';
import { getAccount } from '../store/accountStore';
import { buildReplaceScript, NETWORK_ERROR } from './pullSnapshot';
import { snapshotTables, type LocalRow, type LocalSnapshot, type LocalTable } from './snapshotMapping';
import { hasSyncedFamily, syncTarget } from './syncRunner';
import { requestSyncSoon } from './syncSoon';
import { toIso } from './pushChildRecords';

/**
 * 로그인한 폰의 관리자 편집을 서버에 먼저 저장한다(P6.15). 편집 함수(검증 규칙 포함)는 지금처럼 로컬에서 실행하고,
 * 실행 전후 '가족 데이터' 테이블을 비교해 바뀐 행만 서버에 저장한다. 서버 저장이 실패하면(인터넷 없음 등) 로컬 편집을 되돌린다.
 * 새로 만든 행은 로컬 id를 그대로 서버 id로 쓴다(로컬이 서버 사본이라 id가 이어진다). 체크·보석 기록은 동기화가 올린다(P6.14).
 * 로그인하지 않았거나 아직 서버와 한 번도 맞추지 않은 폰은 지금처럼 로컬에만 저장한다.
 */
export const parentTables = ['periods', 'timetable_sets', 'timetable_settings', 'timetable_items', 'day_exceptions', 'tasks', 'rewards'] as const satisfies readonly LocalTable[];
type ParentTable = (typeof parentTables)[number];
type Row = LocalRow;

export type ParentDiff = { readonly table: ParentTable; readonly upserts: readonly Row[]; readonly deletes: readonly number[] };

const keyOf = (table: ParentTable, row: Row): string => (table === 'timetable_settings' ? String(row.family_id) : String(row.id));
const same = (a: Row, b: Row) => Object.keys(a).every((column) => a[column] === b[column]);

/** 편집 전후 로컬 행 비교. 바뀌거나 새로 생긴 행은 upsert, 사라진 행은 delete(id). */
export function diffParentTables(before: Partial<Record<LocalTable, readonly Row[]>>, after: Partial<Record<LocalTable, readonly Row[]>>): ParentDiff[] {
  return parentTables.map((table) => {
    const old = new Map((before[table] ?? []).map((row) => [keyOf(table, row), row]));
    const next = new Map((after[table] ?? []).map((row) => [keyOf(table, row), row]));
    const upserts = [...next.entries()].filter(([key, row]) => { const prev = old.get(key); return !prev || !same(prev, row); }).map(([, row]) => row);
    const deletes = table === 'timetable_settings' ? [] : [...old.keys()].filter((key) => !next.has(key)).map(Number);
    return { table, upserts, deletes };
  }).filter((diff) => diff.upserts.length > 0 || diff.deletes.length > 0);
}

const csvToArray = (value: Row[string]): number[] | null => (typeof value === 'string' && value.trim() ? value.split(',').map(Number) : null);

/** 로컬 행 → 서버 행. 가족은 로그인한 가족 id로, 시각은 ISO로, 반복 요일은 배열로 바꾼다. 서버에 없는 옛 열은 뺀다. */
export function toServerRow(table: ParentTable, row: Row, familyId: string): Record<string, unknown> {
  switch (table) {
    case 'periods': return { id: row.id, family_id: familyId, period_no: row.period_no, start_time: row.start_time, end_time: row.end_time, created_at: toIso(row.created_at) };
    case 'timetable_sets': return { id: row.id, family_id: familyId, name: row.name, created_at: toIso(row.created_at) };
    case 'timetable_settings': return { family_id: familyId, active_set_id: row.active_set_id };
    case 'timetable_items': return {
      id: row.id, family_id: familyId, set_id: row.set_id, weekday: row.weekday, period_no: row.period_no, start_time: row.start_time, end_time: row.end_time,
      title: row.title, category: row.category, color_key: row.color_key, icon_key: row.icon_key, alert_mode: row.alert_mode, alert_before_min: row.alert_before_min,
      memo: row.memo ?? '', created_at: toIso(row.created_at),
    };
    case 'day_exceptions': return { id: row.id, family_id: familyId, start_date: row.start_date, end_date: row.end_date, type: row.type, note: row.note ?? '' };
    case 'tasks': return {
      id: row.id, family_id: familyId, title: row.title, repeat_weekdays: csvToArray(row.repeat_weekdays), task_date: row.task_date, remind_time: row.remind_time,
      alert_mode: row.alert_mode, sticker_reward: row.sticker_reward, effective_from: row.effective_from, effective_until: row.effective_until, created_at: toIso(row.created_at),
    };
    case 'rewards': return { id: row.id, family_id: familyId, title: row.title, sticker_goal: row.sticker_goal, achieved_at: toIso(row.achieved_at) };
  }
}

async function readAllLocal(database: Pick<RewardDatabase, 'getAllAsync'>): Promise<LocalSnapshot> {
  const entries = await Promise.all(snapshotTables.map(async ([, table]) => [table, await database.getAllAsync<Row>(`SELECT * FROM ${table}`)] as const));
  return Object.fromEntries(entries) as unknown as LocalSnapshot;
}

function check(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(/network|fetch|timed? ?out/i.test(result.error.message) ? NETWORK_ERROR : result.error.message);
}

/** 서버에 저장한다. 새로 만들기·고치기는 참조되는 쪽부터, 지우기는 참조하는 쪽부터. */
export async function applyParentDiff(diffs: readonly ParentDiff[], familyId: string): Promise<void> {
  const db = getSupabase();
  for (const diff of [...diffs].reverse()) {
    if (diff.deletes.length) check(await db.from(`tt_${diff.table}`).delete().eq('family_id', familyId).in('id', diff.deletes));
  }
  for (const diff of diffs) {
    if (!diff.upserts.length) continue;
    const onConflict = diff.table === 'timetable_settings' ? 'family_id' : 'id';
    check(await db.from(`tt_${diff.table}`).upsert(diff.upserts.map((row) => toServerRow(diff.table, row, familyId)), { onConflict }));
  }
}

export const OFFLINE_EDIT_MESSAGE = '인터넷 연결이 필요해요. 바꾼 내용은 저장하지 않았어요.';

export async function runAdminEdit<T>(action: () => Promise<T>): Promise<T> {
  const target = syncTarget(getAccount());
  if (!target || !hasSyncedFamily(target.familyId)) return action();
  const database = await getDatabase();
  const before = await readAllLocal(database);
  const result = await action();
  const diffs = diffParentTables(before, await readAllLocal(database));
  if (diffs.length === 0) return result;
  try {
    await applyParentDiff(diffs, target.familyId);
  } catch (error) {
    // 서버에 저장하지 못했으면 편집 전으로 되돌려 서버와 폰이 어긋나지 않게 한다(체크 기록과 겹치지 않게 같은 줄에서)
    await withRewardQueue(async () => {
      try { await database.execAsync(buildReplaceScript(before)); } catch { await database.execAsync('ROLLBACK').catch(() => undefined); }
    });
    const message = error instanceof Error ? error.message : '';
    throw new Error(message === NETWORK_ERROR ? OFFLINE_EDIT_MESSAGE : '서버에 저장하지 못했어요. 바꾼 내용은 저장하지 않았어요. 잠시 뒤 다시 해 주세요.');
  }
  requestSyncSoon(); // 서버 내용으로 다시 맞추고(다른 기기 변경 포함) 알림·위젯을 갱신한다
  return result;
}
