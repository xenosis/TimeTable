import { withRewardTransaction, type RewardDatabase } from '../db/rewardRepository';
import { getSupabase } from '../server/supabaseClient';
import { snapshotTables, toLocalSnapshot, type LocalSnapshot, type ServerSnapshot, type ServerTable } from './snapshotMapping';

const PAGE = 1000;

/** 서버 한 테이블에서 이 가족 행을 모두 읽는다. Supabase API는 한 번에 최대 1000행이라 나눠 읽는다. */
async function fetchFamilyRows(table: ServerTable, familyId: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getSupabase().from(table).select('*').eq('family_id', familyId).range(from, from + PAGE - 1);
    if (error) throw new Error(`서버에서 ${table}을(를) 읽지 못했어요.`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/** 서버의 가족 데이터 전체. 하나라도 읽지 못하면 실패해 로컬을 건드리지 않는다. */
export async function fetchServerSnapshot(familyId: string): Promise<ServerSnapshot> {
  const entries = await Promise.all(snapshotTables.map(async ([table]) => [table, await fetchFamilyRows(table, familyId)] as const));
  return Object.fromEntries(entries) as unknown as ServerSnapshot;
}

/** 지우는 순서: 참조하는 쪽 먼저(외래키). 로컬에는 한 가족만 있으므로 테이블 전체를 비운다. */
const clearOrder = [
  'task_completions', 'task_completion_history', 'sticker_ledger', 'gem_rights', 'timetable_items',
  'timetable_settings', 'tasks', 'timetable_sets', 'periods', 'day_exceptions', 'rewards',
] as const;

/**
 * 로컬 SQLite의 가족 데이터를 서버 내용으로 통째로 바꾼다(한 트랜잭션). 중간에 실패하면 원래대로 되돌아간다.
 * 앱·위젯 체크와 같은 트랜잭션 줄(withRewardTransaction)에 서서, 체크 기록과 겹쳐 쓰지 않는다.
 */
export async function replaceLocalWithSnapshot(database: RewardDatabase, snapshot: LocalSnapshot): Promise<void> {
  await withRewardTransaction(database, async () => {
    for (const table of clearOrder) await database.runAsync(`DELETE FROM ${table}`);
    for (const [, table] of snapshotTables) {
      for (const row of snapshot[table]) {
        const columns = Object.keys(row);
        await database.runAsync(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, ...columns.map((column) => row[column]));
      }
    }
  });
}

/** 서버에서 받아 로컬을 바꾼다. 받은 테이블별 행 수를 돌려준다. */
export async function pullFamilySnapshot(database: RewardDatabase, familyId: string): Promise<Record<string, number>> {
  const snapshot = toLocalSnapshot(await fetchServerSnapshot(familyId));
  await replaceLocalWithSnapshot(database, snapshot);
  return Object.fromEntries(Object.entries(snapshot).map(([table, rows]) => [table, rows.length]));
}
