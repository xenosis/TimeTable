import { pushChildRecords, wouldWipeServer } from '../src/sync/pushChildRecords';
import type { RewardDatabase } from '../src/db/rewardRepository';

type ReadDb = Pick<RewardDatabase, 'getAllAsync'>;

// 서버 테이블을 흉내 내는 메모리 저장소. pushChildRecords가 부르는 supabase-js 모양(select·delete·upsert·insert)만 만든다
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let failNextInsert = false;
let nextId = 1000;

function mockBuilder(table: string) {
  const rows = () => (tables[table] ??= []);
  const chain = {
    select: () => chain, eq: () => chain, order: () => chain,
    range: async () => ({ data: rows(), error: null }),
    delete: () => ({ in: async (_: string, ids: number[]) => { tables[table] = rows().filter((row) => !ids.includes(Number(row.id))); return { error: null }; } }),
    upsert: async (items: Row[]) => { for (const item of items) rows().push({ id: nextId++, ...item }); return { error: null }; },
    insert: async (items: Row[]) => {
      if (failNextInsert) { failNextInsert = false; return { error: { message: 'Network request failed' } }; }
      for (const item of items) rows().push({ id: nextId++, ...item });
      return { error: null };
    },
  };
  return chain;
}
jest.mock('../src/server/supabaseClient', () => ({ getSupabase: () => ({ from: (table: string) => mockBuilder(table) }) }));

const localRows: Record<string, Row[]> = {
  task_completions: [{ task_id: 7001, completion_date: '2026-10-07', done_at: '2026-10-07 01:00:00', done_by: 'child' }],
  task_completion_history: [{ task_id: 7001, completion_date: '2026-10-07' }],
  sticker_ledger: [{ reason: 'manual-count:gem', delta: 2, task_id: null, created_at: '2026-10-07 01:00:00' }],
  gem_rights: [],
};
const database = { getAllAsync: async (sql: string) => localRows[/FROM (\w+)/.exec(sql)?.[1] ?? ''] ?? [] } as unknown as ReadDb;

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  tables.tt_tasks = [{ id: 7001 }];
  tables.tt_task_completions = [{ id: 1, task_id: 7001, completion_date: '2026-10-06', done_by: 'child' }, { id: 2, task_id: 7001, completion_date: '2026-10-05', done_by: 'parent' }];
  failNextInsert = false;
});

test('중간에 실패해도 다시 실행하면 같은 결과로 맞춰지고(중복 없음), 아빠가 남긴 체크는 지우지 않는다', async () => {
  failNextInsert = true; // 장부 넣기에서 실패
  await expect(pushChildRecords(database, 'fam-1', 'child-uid')).rejects.toThrow('Network request failed');
  await pushChildRecords(database, 'fam-1', 'child-uid');
  await pushChildRecords(database, 'fam-1', 'child-uid'); // 한 번 더 해도 그대로
  expect(tables.tt_task_completions.map((row) => `${String(row.completion_date)}:${String(row.done_by)}`).sort()).toEqual(['2026-10-05:parent', '2026-10-07:child']);
  expect(tables.tt_task_completion_history).toHaveLength(1);
  expect(tables.tt_sticker_ledger).toHaveLength(1);
});

test('폰 기록이 통째로 비었는데 서버에 기록이 있으면 지우지 않고 멈춘다', async () => {
  const emptyLocal = { completions: [], history: [], ledger: [], gems: [] };
  expect(wouldWipeServer(emptyLocal, { completionDeletes: [1], ledgerDeletes: [] })).toBe(true);
  expect(wouldWipeServer(emptyLocal, { completionDeletes: [], ledgerDeletes: [] })).toBe(false);
  // 폰에 기록이 하나라도 있으면 정상 동기화(지우기 포함)
  expect(wouldWipeServer({ ...emptyLocal, history: [{}] }, { completionDeletes: [1], ledgerDeletes: [2] })).toBe(false);
  const empty = { getAllAsync: async () => [] } as unknown as ReadDb;
  await expect(pushChildRecords(empty, 'fam-1', 'child-uid')).rejects.toThrow('이 폰의 기록이 비어 있어');
  expect(tables.tt_task_completions).toHaveLength(2);
});

test('폰이 비어 있어도 서버에 받을 수 있음 보석 자격만 있으면 멈추지 않는다(딸 폰이 계산해 지우는 기록)', async () => {
  tables.tt_task_completions = [];
  tables.tt_gem_rights = [{ id: 5, earned_date: '2026-10-01', state: 'available' }, { id: 6, earned_date: '2026-09-20', state: 'requested' }];
  const empty = { getAllAsync: async () => [] } as unknown as ReadDb;
  await pushChildRecords(empty, 'fam-1', 'child-uid');
  expect(tables.tt_gem_rights.map((row) => row.state)).toEqual(['requested']);
});
