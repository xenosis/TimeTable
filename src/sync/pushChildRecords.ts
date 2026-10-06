import type { RewardDatabase } from '../db/rewardRepository';
import { getSupabase } from '../server/supabaseClient';
import { fetchFamilyRows, NETWORK_ERROR } from './pullSnapshot';
import { toSqliteUtc } from './snapshotMapping';

/**
 * 딸 폰이 주인인 기록(체크·완료 이력·보석 장부·보석 자격)을 서버와 맞춘다(P6.14). id가 아니라 자연 키로 비교한다:
 * 체크·완료 이력은 (할 일, 날짜), 보석 자격은 받은 날짜, 장부는 하루 완료·보석 보상이면 사유, 그 밖에는 (사유, 수량, 시각).
 * 폰에만 있는 것은 서버에 넣고, 폰에서 지운 것은 서버에서도 지운다. 완료 이력은 지우지 않는다(취소해도 남는 기록).
 * 보석 자격은 서버가 더 나아간 상태(요청함 < 줬어요)면 서버 것을 두고, 서버에만 있는 자격은 '받을 수 있음'일 때만 지운다.
 */
type Row = Record<string, unknown>;
export type ChildRecords = { readonly completions: readonly Row[]; readonly history: readonly Row[]; readonly ledger: readonly Row[]; readonly gems: readonly Row[] };
export type ChildPushPlan = {
  readonly completionInserts: readonly Row[]; readonly completionDeletes: readonly number[];
  readonly historyInserts: readonly Row[];
  readonly ledgerInserts: readonly Row[]; readonly ledgerDeletes: readonly number[];
  readonly gemUpserts: readonly Row[]; readonly gemDeletes: readonly number[];
};

const stateRank: Readonly<Record<string, number>> = { available: 0, requested: 1, given: 2 };
const time = (value: unknown): string => toSqliteUtc(typeof value === 'string' && !value.includes('T') ? `${value.replace(' ', 'T')}Z` : value) ?? '';
/** 로컬 SQLite UTC 문자열 → 서버에 보낼 ISO 문자열 */
export const toIso = (value: unknown): string | null => (typeof value === 'string' && value ? `${value.replace(' ', 'T')}Z` : null);
const dayKey = (row: Row) => `${String(row.task_id)}|${String(row.completion_date)}`;
/** 하루 완료·보석 보상은 서버에 사유 하나당 한 줄만 있을 수 있다(부분 unique 인덱스) */
export function ledgerKey(row: Row): string {
  const reason = String(row.reason);
  return /^(daily-completion|gem-reward):/.test(reason) ? reason : `${reason}|${String(row.delta)}|${time(row.created_at)}`;
}

/** 같은 키가 여러 줄일 수 있는 장부는 개수까지 맞춘다(같은 시각·수량의 조정이 두 번 있을 수 있음). */
function multisetDiff(local: readonly Row[], server: readonly Row[], key: (row: Row) => string): { inserts: Row[]; deletes: Row[] } {
  const remaining = new Map<string, Row[]>();
  for (const row of server) remaining.set(key(row), [...(remaining.get(key(row)) ?? []), row]);
  const inserts: Row[] = [];
  for (const row of local) {
    const matches = remaining.get(key(row));
    if (matches && matches.length > 0) matches.shift();
    else inserts.push(row);
  }
  return { inserts, deletes: [...remaining.values()].flat() };
}

export function planChildPush(local: ChildRecords, server: ChildRecords, familyId: string, childId: string): ChildPushPlan {
  const serverCompletions = new Map(server.completions.map((row) => [dayKey(row), row]));
  const localCompletions = new Set(local.completions.map(dayKey));
  const serverHistory = new Set(server.history.map(dayKey));
  const ledger = multisetDiff(local.ledger, server.ledger, ledgerKey);
  const serverGems = new Map(server.gems.map((row) => [String(row.earned_date), row]));
  const localGemDates = new Set(local.gems.map((row) => String(row.earned_date)));
  return {
    completionInserts: local.completions.filter((row) => !serverCompletions.has(dayKey(row))).map((row) => ({
      family_id: familyId, task_id: row.task_id, completion_date: row.completion_date, done_at: toIso(row.done_at), done_by: row.done_by ?? 'child',
    })),
    completionDeletes: server.completions.filter((row) => !localCompletions.has(dayKey(row))).map((row) => Number(row.id)),
    historyInserts: local.history.filter((row) => !serverHistory.has(dayKey(row))).map((row) => ({ family_id: familyId, task_id: row.task_id, completion_date: row.completion_date })),
    ledgerInserts: ledger.inserts.map((row) => ({ family_id: familyId, child_id: childId, delta: row.delta, reason: row.reason, task_id: row.task_id ?? null, created_at: toIso(row.created_at) })),
    ledgerDeletes: ledger.deletes.map((row) => Number(row.id)),
    gemUpserts: local.gems.filter((row) => {
      const serverRow = serverGems.get(String(row.earned_date));
      if (!serverRow) return true;
      const localRank = stateRank[String(row.state)] ?? 0;
      const serverRank = stateRank[String(serverRow.state)] ?? 0;
      return localRank > serverRank; // 서버가 같거나 더 나아갔으면 서버 것을 둔다
    }).map((row) => ({
      family_id: familyId, child_id: childId, earned_date: row.earned_date, state: row.state, requested_at: toIso(row.requested_at), given_at: toIso(row.given_at), created_at: toIso(row.created_at),
    })),
    gemDeletes: server.gems.filter((row) => !localGemDates.has(String(row.earned_date)) && row.state === 'available').map((row) => Number(row.id)),
  };
}

export function isEmptyPlan(plan: ChildPushPlan): boolean {
  return Object.values(plan).every((items) => items.length === 0);
}

export async function readLocalChildRecords(database: Pick<RewardDatabase, 'getAllAsync'>): Promise<ChildRecords> {
  const [completions, history, ledger, gems] = await Promise.all([
    database.getAllAsync<Row>('SELECT * FROM task_completions'),
    database.getAllAsync<Row>('SELECT * FROM task_completion_history'),
    database.getAllAsync<Row>("SELECT * FROM sticker_ledger WHERE family_id = 'local-family'"),
    database.getAllAsync<Row>("SELECT * FROM gem_rights WHERE family_id = 'local-family'"),
  ]);
  return { completions, history, ledger, gems };
}

async function readServerChildRecords(familyId: string): Promise<ChildRecords> {
  const [completions, history, ledger, gems] = await Promise.all([
    fetchFamilyRows('tt_task_completions', familyId), fetchFamilyRows('tt_task_completion_history', familyId),
    fetchFamilyRows('tt_sticker_ledger', familyId), fetchFamilyRows('tt_gem_rights', familyId),
  ]);
  return { completions, history, ledger, gems };
}

function check(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(/network|fetch|timed? ?out/i.test(result.error.message) ? NETWORK_ERROR : '체크·보석 기록을 서버에 올리지 못했어요.');
}

/** 폰의 기록을 서버와 맞춘다. 같은 계획을 다시 실행해도 결과가 같다(실패하면 다음 동기화에서 다시). 올린 건수를 돌려준다. */
export async function pushChildRecords(database: Pick<RewardDatabase, 'getAllAsync'>, familyId: string, childId: string): Promise<number> {
  const plan = planChildPush(await readLocalChildRecords(database), await readServerChildRecords(familyId), familyId, childId);
  if (isEmptyPlan(plan)) return 0;
  const db = getSupabase();
  if (plan.completionDeletes.length) check(await db.from('tt_task_completions').delete().in('id', plan.completionDeletes));
  if (plan.ledgerDeletes.length) check(await db.from('tt_sticker_ledger').delete().in('id', plan.ledgerDeletes));
  if (plan.gemDeletes.length) check(await db.from('tt_gem_rights').delete().in('id', plan.gemDeletes));
  if (plan.completionInserts.length) check(await db.from('tt_task_completions').upsert(plan.completionInserts, { onConflict: 'task_id,completion_date', ignoreDuplicates: true }));
  if (plan.historyInserts.length) check(await db.from('tt_task_completion_history').upsert(plan.historyInserts, { onConflict: 'task_id,completion_date', ignoreDuplicates: true }));
  if (plan.ledgerInserts.length) check(await db.from('tt_sticker_ledger').insert(plan.ledgerInserts));
  if (plan.gemUpserts.length) check(await db.from('tt_gem_rights').upsert(plan.gemUpserts, { onConflict: 'family_id,child_id,earned_date' }));
  return Object.values(plan).reduce((sum, items) => sum + items.length, 0);
}
