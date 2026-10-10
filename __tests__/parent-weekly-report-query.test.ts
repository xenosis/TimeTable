import { loadWeeklyReport } from '../src/components/parentWeeklyReport';
import { withRewardQueue } from '../src/db/rewardQueue';
import { openTestDatabase } from '../test-utils/sqliteTestDatabase';

const mockDatabase = jest.fn();
jest.mock('../src/db/database', () => ({ getDatabase: () => mockDatabase() }));

test('실제 SQL 집계에서 생성 전 날짜의 할 일을 제외한다', async () => {
  const database = openTestDatabase();
  try {
    await database.execAsync(`
      CREATE TABLE tasks (id INTEGER, title TEXT, family_id TEXT, effective_until TEXT, task_date TEXT, repeat_weekdays TEXT, effective_from TEXT, created_at TEXT);
      CREATE TABLE task_completions (id INTEGER, task_id INTEGER, completion_date TEXT);
      CREATE TABLE sticker_ledger (id INTEGER, family_id TEXT, delta INTEGER, reason TEXT, created_at TEXT);
    `);
    const createdAt = new Date(2026, 9, 10, 12).toISOString().replace('T', ' ').slice(0, 19);
    await database.runAsync('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 1, '반복', 'local-family', null, null, '5,6', '2026-10-09', createdAt);
    await database.runAsync('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 2, '과거 날짜', 'local-family', null, '2026-10-09', null, null, createdAt);
    mockDatabase.mockResolvedValue(database);
    const report = await loadWeeklyReport(new Date(2026, 9, 10, 20));
    expect(report.days.find((day) => day.date === '2026-10-09')?.total).toBe(0);
    expect(report.days.find((day) => day.date === '2026-10-10')?.total).toBe(1);
    expect(report.total).toBe(1);
  } finally { database.close(); }
});

test('집계를 읽는 동안 동기화 교체는 같은 큐에서 기다린다', async () => {
  let finish!: () => void;
  let started!: () => void;
  const reading = new Promise<void>((resolve) => { started = resolve; });
  const held = new Promise<void>((resolve) => { finish = resolve; });
  mockDatabase.mockResolvedValue({ getAllAsync: jest.fn(async () => { started(); await held; return []; }) });
  const report = loadWeeklyReport(new Date(2026, 9, 5, 20));
  await reading;
  const replace = jest.fn(async () => undefined);
  const replacement = withRewardQueue(replace);
  await Promise.resolve();
  expect(replace).not.toHaveBeenCalled();
  finish();
  await report;
  await replacement;
  expect(replace).toHaveBeenCalledTimes(1);
});
