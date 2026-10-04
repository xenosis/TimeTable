/** @jest-environment node */
import { migrateDatabase } from '../src/db/migrations';
import { createTask } from '../src/db/taskRepository';
import { setTaskCompletionWithRewards } from '../src/db/rewardRepository';
import { applyPendingWidgetChecks, parsePendingWidgetChecks } from '../src/widgets/widgetPendingChecks';
import { openTestDatabase } from '../test-utils/sqliteTestDatabase';

let database: ReturnType<typeof openTestDatabase>;

async function makeTask(title: string): Promise<number> {
  await createTask(database, { title, repeatWeekdays: [0, 1, 2, 3, 4, 5, 6], taskDate: '', effectiveFrom: '2026-01-01' });
  await database.runAsync("UPDATE tasks SET created_at = '2026-01-01 00:00:00'"); // 새 규칙: 할 일은 만든 날부터만 센다 → 테스트의 날짜들보다 이전에 만든 것으로 맞춘다
  return (await database.getFirstAsync<{ id: number }>('SELECT id FROM tasks WHERE title = ?', title))!.id;
}

const completions = async (taskId: number) => database.getAllAsync<{ completion_date: string }>('SELECT completion_date FROM task_completions WHERE task_id = ? ORDER BY completion_date', taskId);
const take = (checks: unknown) => async () => JSON.stringify(checks);
const acks: string[] = [];
const ack = async (applied: string) => { acks.push(applied); };

beforeEach(async () => {
  acks.length = 0;
  database = openTestDatabase();
  await migrateDatabase(database);
});

describe('parsePendingWidgetChecks', () => {
  it('깨진 JSON이나 배열이 아닌 값은 빈 목록이다', () => {
    expect(parsePendingWidgetChecks(undefined)).toEqual([]);
    expect(parsePendingWidgetChecks('')).toEqual([]);
    expect(parsePendingWidgetChecks('not-json')).toEqual([]);
    expect(parsePendingWidgetChecks('{"taskId":1}')).toEqual([]);
  });

  it('형식이 틀린 항목은 버리고 올바른 항목만 남긴다', () => {
    const payload = JSON.stringify([
      { taskId: 1, date: '2026-10-01', completed: true },
      { taskId: '2', date: '2026-10-01', completed: true },
      { taskId: -1, date: '2026-10-01', completed: true },
      { taskId: 3, date: '10/01', completed: true },
      { taskId: 4, date: '2026-10-01' },
      null,
      'x',
    ]);
    expect(parsePendingWidgetChecks(payload)).toEqual([{ taskId: 1, date: '2026-10-01', completed: true }]);
  });

  it('같은 할 일·날짜는 가장 마지막 상태 하나만 남는다', () => {
    const payload = JSON.stringify([
      { taskId: 1, date: '2026-10-01', completed: true },
      { taskId: 2, date: '2026-10-01', completed: true },
      { taskId: 1, date: '2026-10-01', completed: false },
    ]);
    expect(parsePendingWidgetChecks(payload)).toEqual([
      { taskId: 2, date: '2026-10-01', completed: true },
      { taskId: 1, date: '2026-10-01', completed: false },
    ]);
  });
});

describe('applyPendingWidgetChecks: 앱 안 체크와 같은 규칙으로 기록 (실제 SQLite)', () => {
  it('완료를 기록하고 완료 이력도 남긴다', async () => {
    const id = await makeTask('준비물');
    expect(await applyPendingWidgetChecks(database, take([{ taskId: id, date: '2026-10-01', completed: true }]))).toBe(1);
    expect((await completions(id)).map(({ completion_date }) => completion_date)).toEqual(['2026-10-01']);
    const history = await database.getAllAsync('SELECT 1 FROM task_completion_history WHERE task_id = ?', id);
    expect(history).toHaveLength(1);
  });

  it('같은 체크가 두 번 들어와도 한 번만 기록된다', async () => {
    const id = await makeTask('준비물');
    await applyPendingWidgetChecks(database, take([{ taskId: id, date: '2026-10-01', completed: true }]));
    await applyPendingWidgetChecks(database, take([{ taskId: id, date: '2026-10-01', completed: true }]));
    expect(await completions(id)).toHaveLength(1);
  });

  it('다시 눌러 취소하면 완료가 지워진다(완료 이력은 남는다)', async () => {
    const id = await makeTask('준비물');
    await applyPendingWidgetChecks(database, take([{ taskId: id, date: '2026-10-01', completed: true }]));
    await applyPendingWidgetChecks(database, take([{ taskId: id, date: '2026-10-01', completed: false }]));
    expect(await completions(id)).toEqual([]);
    expect(await database.getAllAsync('SELECT 1 FROM task_completion_history WHERE task_id = ?', id)).toHaveLength(1);
  });

  it('하루의 할 일을 모두 위젯에서 체크하면 앱 체크와 같이 전체 완료가 기록된다', async () => {
    const first = await makeTask('숙제');
    const second = await makeTask('책 읽기');
    await applyPendingWidgetChecks(database, take([
      { taskId: first, date: '2026-10-01', completed: true },
      { taskId: second, date: '2026-10-01', completed: true },
    ]));
    const rows = await database.getAllAsync<{ reason: string }>("SELECT reason FROM sticker_ledger WHERE reason LIKE 'daily-completion:%'");
    expect(rows.map(({ reason }) => reason)).toEqual(['daily-completion:2026-10-01']);
  });

  it('그새 지워진 할 일이 섞여 있어도 나머지는 기록한다', async () => {
    const id = await makeTask('준비물');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const applied = await applyPendingWidgetChecks(database, take([
      { taskId: 9999, date: '2026-10-01', completed: true },
      { taskId: id, date: '2026-10-01', completed: true },
    ]));
    warn.mockRestore();
    expect(applied).toBe(1);
    expect(await completions(id)).toHaveLength(1);
  });

  it('기록에 성공한 체크만 확인(삭제)을 요청한다', async () => {
    const id = await makeTask('준비물');
    const check = { taskId: id, date: '2026-10-01', completed: true };
    await applyPendingWidgetChecks(database, take([check]), ack);
    expect(acks).toEqual([JSON.stringify([check])]);
  });

  it('일시적인 오류로 기록하지 못한 체크는 확인하지 않고 남겨 다음에 다시 시도한다', async () => {
    const id = await makeTask('준비물');
    const other = await makeTask('숙제');
    const flaky = {
      ...database,
      execAsync: database.execAsync,
      getFirstAsync: database.getFirstAsync,
      getAllAsync: database.getAllAsync,
      runAsync: async (sql: string, ...params: unknown[]) => {
        if (sql.includes('INSERT OR IGNORE INTO task_completions') && params[0] === id) throw new Error('database is locked');
        return database.runAsync(sql, ...params);
      },
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const applied = await applyPendingWidgetChecks(flaky, take([
      { taskId: id, date: '2026-10-01', completed: true },
      { taskId: other, date: '2026-10-01', completed: true },
    ]), ack);
    warn.mockRestore();
    expect(applied).toBe(1);
    expect(acks).toEqual([JSON.stringify([{ taskId: other, date: '2026-10-01', completed: true }])]); // 실패한 것은 남는다
    // 다음에 다시 시도하면 기록된다
    await applyPendingWidgetChecks(database, take([{ taskId: id, date: '2026-10-01', completed: true }]), ack);
    expect(await completions(id)).toHaveLength(1);
  });

  it('지워진 할 일의 체크는 기록하지 않고 대기 목록에서 버린다', async () => {
    const check = { taskId: 9999, date: '2026-10-01', completed: true };
    expect(await applyPendingWidgetChecks(database, take([check]), ack)).toBe(0);
    expect(acks).toEqual([JSON.stringify([check])]);
  });

  it('화면의 체크와 위젯 체크 반영이 동시에 돌아도 트랜잭션이 겹쳐 실패하지 않는다', async () => {
    const first = await makeTask('숙제');
    const second = await makeTask('책 읽기');
    const third = await makeTask('준비물');
    await Promise.all([
      setTaskCompletionWithRewards(database, first, '2026-10-01', 4, true),
      applyPendingWidgetChecks(database, take([{ taskId: second, date: '2026-10-01', completed: true }]), ack),
      setTaskCompletionWithRewards(database, third, '2026-10-01', 4, true),
    ]);
    expect(await completions(first)).toHaveLength(1);
    expect(await completions(second)).toHaveLength(1);
    expect(await completions(third)).toHaveLength(1);
    const rows = await database.getAllAsync<{ reason: string }>("SELECT reason FROM sticker_ledger WHERE reason LIKE 'daily-completion:%'");
    expect(rows).toHaveLength(1);
  });

  it('체크를 읽지 못하면 0건이고 예외를 던지지 않는다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(applyPendingWidgetChecks(database, async () => { throw new Error('native down'); })).resolves.toBe(0);
    warn.mockRestore();
  });
});
