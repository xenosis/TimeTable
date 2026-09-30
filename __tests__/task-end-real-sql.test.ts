/** @jest-environment node */
import { migrateDatabase } from '../src/db/migrations';
import { setTaskCompletionWithRewards } from '../src/db/rewardRepository';
import { buildTaskNotificationsFromDatabase } from '../src/notifications/taskRollingSchedule';
import { createTask, endRecurringTask, getEndableTasks, getTodayTasks, setTaskCompleted } from '../src/db/taskRepository';
import { openTestDatabase } from '../test-utils/sqliteTestDatabase';

const everyDay = [0, 1, 2, 3, 4, 5, 6];
let database: ReturnType<typeof openTestDatabase>;

async function idOf(title: string): Promise<number> {
  const row = await database.getFirstAsync<{ id: number }>('SELECT id FROM tasks WHERE title = ?', title);
  if (!row) throw new Error(`할 일을 찾을 수 없어요: ${title}`);
  return row.id;
}

beforeEach(async () => {
  database = openTestDatabase();
  await migrateDatabase(database);
  await createTask(database, { title: '학원 숙제', repeatWeekdays: everyDay, taskDate: '', effectiveFrom: '2026-10-01' });
  await createTask(database, { title: '책 읽기', repeatWeekdays: everyDay, taskDate: '', effectiveFrom: '2026-10-01' });
});

// 2026-10-01은 목요일(4), 2026-10-02는 금요일(5)
describe('완료 이력이 있는 반복 할 일 종료 (실제 SQLite)', () => {
  it('완료 이력이 생기면 종료 대상 목록에 나온다', async () => {
    expect(await getEndableTasks(database)).toEqual([]);
    await setTaskCompleted(database, await idOf('학원 숙제'), '2026-10-01', true);
    expect((await getEndableTasks(database)).map(({ title }) => title)).toEqual(['학원 숙제']);
  });

  it('종료일까지는 오늘 목록에 남고, 그 다음 날부터 빠지며 다른 할 일은 그대로 남는다', async () => {
    const id = await idOf('학원 숙제');
    await setTaskCompleted(database, id, '2026-10-01', true);
    await endRecurringTask(database, id, '2026-10-01');
    expect((await getTodayTasks(database, '2026-10-01', 4)).map(({ title }) => title).sort()).toEqual(['책 읽기', '학원 숙제']);
    expect((await getTodayTasks(database, '2026-10-02', 5)).map(({ title }) => title)).toEqual(['책 읽기']);
    expect((await getTodayTasks(database, '2026-10-20', 2)).map(({ title }) => title)).toEqual(['책 읽기']);
  });

  it('과거 완료 이력은 종료 뒤에도 남고 종료된 할 일은 종료 대상 목록에서도 사라진다', async () => {
    const id = await idOf('학원 숙제');
    await setTaskCompleted(database, id, '2026-10-01', true);
    await endRecurringTask(database, id, '2026-10-01');
    const past = await getTodayTasks(database, '2026-10-01', 4);
    expect(past.find(({ title }) => title === '학원 숙제')?.completed).toBe(1);
    const history = await database.getAllAsync<{ completion_date: string }>('SELECT completion_date FROM task_completion_history WHERE task_id = ?', id);
    expect(history.map(({ completion_date }) => completion_date)).toEqual(['2026-10-01']);
    expect(await getEndableTasks(database)).toEqual([]);
  });

  it('이미 종료한 할 일을 다시 종료하려 하면 거절한다', async () => {
    const id = await idOf('학원 숙제');
    await setTaskCompleted(database, id, '2026-10-01', true);
    await endRecurringTask(database, id, '2026-10-01');
    await expect(endRecurringTask(database, id, '2026-10-05')).rejects.toThrow('이미 변경');
  });
});

describe('종료한 할 일과 보석(전체 완료) 계산 (실제 SQLite)', () => {
  const dailyRows = async () => (await database.getAllAsync<{ reason: string }>("SELECT reason FROM sticker_ledger WHERE reason LIKE 'daily-completion:%'")).map(({ reason }) => reason);

  it('그만둔 할 일이 남아 있어도 나머지를 다 하면 그날 전체 완료가 기록된다', async () => {
    const ended = await idOf('학원 숙제');
    const kept = await idOf('책 읽기');
    await setTaskCompletionWithRewards(database, ended, '2026-10-01', 4, true);
    await endRecurringTask(database, ended, '2026-10-01');
    await setTaskCompletionWithRewards(database, kept, '2026-10-02', 5, true);
    expect(await dailyRows()).toEqual(['daily-completion:2026-10-02']);
  });

  it('비교: 그만두지 않았다면 안 한 일이 남아 있어 전체 완료가 기록되지 않는다', async () => {
    const kept = await idOf('책 읽기');
    await setTaskCompletionWithRewards(database, kept, '2026-10-02', 5, true);
    expect(await dailyRows()).toEqual([]);
  });

  it('종료일 당일에는 그 할 일도 필요한 일로 센다', async () => {
    const ended = await idOf('학원 숙제');
    const kept = await idOf('책 읽기');
    await setTaskCompletionWithRewards(database, ended, '2026-10-01', 4, true);
    await endRecurringTask(database, ended, '2026-10-01');
    await setTaskCompletionWithRewards(database, kept, '2026-10-01', 4, true);
    expect(await dailyRows()).toEqual(['daily-completion:2026-10-01']);
  });
});

describe('종료한 할 일과 주간 보석·알림 예약 (실제 SQLite)', () => {
  // 한 주(2026-09-27~10-03)에서 목요일(10-01)에만 있는 '책 읽기'와 매일 있는 '학원 숙제'를 쓴다
  const weekRows = async () => (await database.getAllAsync<{ reason: string }>("SELECT reason FROM sticker_ledger WHERE reason LIKE 'gem-reward:week:%'")).map(({ reason }) => reason);

  async function finishThursday(endHomework: boolean): Promise<void> {
    const homework = await idOf('학원 숙제');
    const reading = await idOf('책 읽기');
    await database.runAsync("UPDATE tasks SET repeat_weekdays = '4' WHERE id = ?", reading);
    await setTaskCompletionWithRewards(database, homework, '2026-10-01', 4, true);
    if (endHomework) await endRecurringTask(database, homework, '2026-10-01');
    await setTaskCompletionWithRewards(database, reading, '2026-10-01', 4, true);
  }

  it('종료일 뒤에는 그 할 일만 있던 날을 필요한 날로 세지 않아 주간 완료가 기록된다', async () => {
    await finishThursday(true);
    expect((await weekRows()).length).toBeGreaterThan(0);
  });

  it('비교: 그만두지 않았다면 금·토요일의 안 한 학원 숙제 때문에 주간 완료가 기록되지 않는다', async () => {
    await finishThursday(false);
    expect(await weekRows()).toEqual([]);
  });

  it('종료한 할 일은 종료일 다음 날부터 알림 예약에서 빠진다(DB 조회 기준)', async () => {
    const homework = await idOf('학원 숙제');
    await database.runAsync("UPDATE tasks SET remind_time = '07:30', alert_mode = 'notify' WHERE id = ?", homework);
    await endRecurringTask(database, homework, '2026-10-02');
    const notifications = await buildTaskNotificationsFromDatabase(database, new Date(2026, 9, 1, 6, 0));
    const days = notifications.filter(({ title }) => title.includes('학원 숙제')).map(({ triggerAt }) => `${triggerAt.getMonth() + 1}-${triggerAt.getDate()}`);
    expect(days.length).toBeGreaterThan(0);
    expect(days.every((day) => day === '10-1' || day === '10-2')).toBe(true);
  });
});
