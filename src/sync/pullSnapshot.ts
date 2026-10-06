import { withRewardQueue, type RewardDatabase } from '../db/rewardRepository';
import { getSupabase } from '../server/supabaseClient';
import { snapshotTables, toLocalSnapshot, type LocalRow, type LocalSnapshot, type LocalTable, type ServerSnapshot, type ServerTable } from './snapshotMapping';

const PAGE = 1000;

/** 페이지를 나눠 읽을 때 행이 빠지거나 겹치지 않게 테이블마다 고정 순서로 읽는다. */
const orderColumns: Readonly<Record<ServerTable, readonly string[]>> = {
  tt_periods: ['id'], tt_timetable_sets: ['id'], tt_timetable_settings: ['family_id'], tt_timetable_items: ['id'],
  tt_day_exceptions: ['id'], tt_tasks: ['id'], tt_task_completions: ['id'], tt_task_completion_history: ['task_id', 'completion_date'],
  tt_sticker_ledger: ['id'], tt_rewards: ['id'], tt_gem_rights: ['id'],
};

export const NETWORK_ERROR = 'Network request failed';

/** 서버 한 테이블에서 이 가족 행을 모두 읽는다. Supabase API는 한 번에 최대 1000행이라 정렬해서 나눠 읽는다. */
async function fetchFamilyRows(table: ServerTable, familyId: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = getSupabase().from(table).select('*').eq('family_id', familyId);
    for (const column of orderColumns[table]) query = query.order(column, { ascending: true });
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) {
      // 인터넷이 없을 때도 supabase-js는 예외 대신 error를 돌려준다. 화면 문구를 고를 수 있게 종류만 남긴다(테이블 이름은 보이지 않는다)
      throw new Error(/network|fetch|timed? ?out/i.test(error.message) ? NETWORK_ERROR : '서버에서 가족 데이터를 읽지 못했어요.');
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/** 서버의 가족 데이터 전체. 하나라도 읽지 못하면 실패해 로컬을 건드리지 않는다. */
export async function fetchServerSnapshot(familyId: string): Promise<ServerSnapshot> {
  const entries = await Promise.all(snapshotTables.map(async ([table]) => [table, await fetchFamilyRows(table, familyId)] as const));
  return Object.fromEntries(entries) as unknown as ServerSnapshot;
}

/** 딸 폰이 주인인 기록. 첫 동기화 뒤에는 서버 내용으로 덮지 않고 폰 것을 지킨다(서버로 올리기는 P6.14). */
export const childOwnedTables = ['task_completions', 'task_completion_history', 'sticker_ledger', 'gem_rights'] as const satisfies readonly LocalTable[];
type ChildOwnedTable = (typeof childOwnedTables)[number];

/** 지우는 순서: 참조하는 쪽 먼저(외래키). 로컬에는 한 가족만 있으므로 테이블 전체를 비운다. */
const clearOrder = [
  'task_completions', 'task_completion_history', 'sticker_ledger', 'gem_rights', 'timetable_items',
  'timetable_settings', 'tasks', 'timetable_sets', 'periods', 'day_exceptions', 'rewards',
] as const;

/** SQL 문자열 안에 넣을 값. 문자열은 작은따옴표를 두 번 써서 감싼다. */
export function sqlLiteral(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('잘못된 숫자 값이에요.');
    return String(value);
  }
  return `'${value.split("'").join("''")}'`;
}

function insertStatements(table: LocalTable, rows: readonly LocalRow[]): string[] {
  return rows.map((row) => {
    const columns = Object.keys(row);
    return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((column) => sqlLiteral(row[column])).join(', ')});`;
  });
}

/**
 * 로컬을 서버 내용으로 바꾸는 SQL 묶음. keep에 준 딸 폰 기록은 서버 것 대신 넣는다(서버에서 지워진 할 일을 가리키는 기록은 버리고,
 * 원장의 task_id는 비운다). 한 번의 execAsync로 실행해 같은 연결의 다른 읽기·쓰기가 중간에 끼어들지 않게 한다.
 */
export function buildReplaceScript(snapshot: LocalSnapshot, keep?: Readonly<Record<ChildOwnedTable, readonly LocalRow[]>>): string {
  const taskIds = new Set(snapshot.tasks.map((task) => task.id));
  const rowsFor = (table: LocalTable): readonly LocalRow[] => {
    if (!keep || !(childOwnedTables as readonly string[]).includes(table)) return snapshot[table];
    const kept = keep[table as ChildOwnedTable];
    if (table === 'sticker_ledger') return kept.map((row) => (row.task_id !== null && !taskIds.has(row.task_id) ? { ...row, task_id: null } : row));
    if (table === 'task_completions' || table === 'task_completion_history') return kept.filter((row) => taskIds.has(row.task_id));
    return kept;
  };
  return [
    'BEGIN IMMEDIATE;',
    ...clearOrder.map((table) => `DELETE FROM ${table};`),
    ...snapshotTables.flatMap(([, table]) => insertStatements(table, rowsFor(table))),
    'COMMIT;',
  ].join('\n');
}

async function readChildOwnedRows(database: RewardDatabase): Promise<Record<ChildOwnedTable, LocalRow[]>> {
  const entries = await Promise.all(childOwnedTables.map(async (table) => [table, await database.getAllAsync<LocalRow>(`SELECT * FROM ${table}`)] as const));
  return Object.fromEntries(entries) as Record<ChildOwnedTable, LocalRow[]>;
}

/**
 * 로컬 SQLite의 가족 데이터를 서버 내용으로 바꾼다. 실패하면 되돌린다(ROLLBACK).
 * keepChildOwned이면 체크·완료 이력·보석 기록은 폰 것을 지킨다. 앱·위젯 체크와 같은 줄(withRewardQueue)에 선다.
 */
export async function replaceLocalWithSnapshot(database: RewardDatabase, snapshot: LocalSnapshot, keepChildOwned = false): Promise<void> {
  await withRewardQueue(async () => {
    const keep = keepChildOwned ? await readChildOwnedRows(database) : undefined;
    try {
      await database.execAsync(buildReplaceScript(snapshot, keep));
    } catch (error) {
      await database.execAsync('ROLLBACK').catch(() => undefined);
      throw error;
    }
  });
}

/** 서버 가족 데이터에 시간표 항목·할 일 등 실제 데이터가 있는지(세트·적용 세트만 있으면 빈 가족). */
export function serverHasFamilyData(snapshot: LocalSnapshot): boolean {
  return snapshotTables.some(([, table]) => table !== 'timetable_sets' && table !== 'timetable_settings' && snapshot[table].length > 0);
}

export async function fetchLocalSnapshot(familyId: string): Promise<LocalSnapshot> {
  return toLocalSnapshot(await fetchServerSnapshot(familyId));
}
