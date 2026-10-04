/** @jest-environment node */
import { migrateDatabase } from '../src/db/migrations';
import { editTaskWithRewards, revokeTodayCompletion, setTaskCompletionWithRewards } from '../src/db/rewardRepository';
import { getCompletedDates, getStickerSummary } from '../src/db/stickerRepository';
import { createTask } from '../src/db/taskRepository';
import { updateGemCounts } from '../src/db/gemCountRepository';
import { openTestDatabase, withTempDirectory } from '../test-utils/sqliteTestDatabase';

let database: ReturnType<typeof openTestDatabase>;
beforeEach(async () => { database = openTestDatabase(); await migrateDatabase(database); });
afterEach(() => database.close());
async function task() {
  await createTask(database, { title: '책 읽기', repeatWeekdays: [0, 1, 2, 3, 4, 5, 6], taskDate: '', effectiveFrom: '2026-10-01' });
  await database.runAsync("UPDATE tasks SET created_at = '2026-01-01 00:00:00'"); // 새 규칙: 할 일은 만든 날부터만 센다 → 테스트의 날짜들보다 이전에 만든 것으로 맞춘다
  return (await database.getFirstAsync<{ id: number }>('SELECT id FROM tasks ORDER BY id DESC LIMIT 1'))!.id;
}

describe('physical gems with manual counts', () => {
  it('keeps gem counts unchanged across repeated completions, a full week/month and cancellation', async () => {
    await updateGemCounts(database, { gems: 7, largeGems: 2 });
    const id = await task();
    for (let day = 1; day <= 31; day++) {
      const date = `2026-10-${String(day).padStart(2, '0')}`;
      const weekday = new Date(2026, 9, day).getDay();
      await expect(setTaskCompletionWithRewards(database, id, date, weekday, true)).resolves.toBeNull();
      await setTaskCompletionWithRewards(database, id, date, weekday, true);
    }
    expect((await getCompletedDates(database)).length).toBe(31);
    await setTaskCompletionWithRewards(database, id, '2026-10-04', 0, false);
    await revokeTodayCompletion(database, '2026-10-05');
    await expect(getStickerSummary(database)).resolves.toMatchObject({ gems: 7, largeGems: 2, total: 9 });
    expect(await database.getAllAsync("SELECT id FROM sticker_ledger WHERE reason LIKE 'gem-reward:%'")).toEqual([]);
  });
  it('preserves legacy rewards and records edits without rebuilding gem balances', async () => {
    await database.runAsync('INSERT INTO sticker_ledger (family_id, child_id, delta, reason) VALUES (?, ?, ?, ?)', 'local-family', 'local-child', 3, 'gem-reward:month:2026-09-30:large-gem');
    const id = await task();
    await setTaskCompletionWithRewards(database, id, '2026-10-04', 0, true);
    await editTaskWithRewards(database, '2026-10-04', 0, async () => undefined);
    await revokeTodayCompletion(database, '2026-10-04');
    await expect(getStickerSummary(database)).resolves.toMatchObject({ gems: 0, largeGems: 3 });
  });
  it('updates both counts including zero and leaves history intact', async () => {
    await updateGemCounts(database, { gems: 8, largeGems: 3 });
    await updateGemCounts(database, { gems: 0, largeGems: 1 });
    await expect(getStickerSummary(database)).resolves.toMatchObject({ gems: 0, largeGems: 1, total: 1 });
    expect((await database.getAllAsync('SELECT id FROM sticker_ledger')).length).toBe(4);
  });
  it('rejects negative, fractional, oversized and non-finite counts without writing', async () => {
    for (const gems of [-1, 1.5, 100000, NaN, Infinity]) await expect(updateGemCounts(database, { gems, largeGems: 0 })).rejects.toThrow('정수');
    expect(await database.getAllAsync('SELECT id FROM sticker_ledger')).toEqual([]);
  });
  it('rolls back both counts if one insert fails', async () => {
    await database.execAsync("CREATE TRIGGER fail_large BEFORE INSERT ON sticker_ledger WHEN NEW.reason = 'manual-count:large-gem' BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    await expect(updateGemCounts(database, { gems: 5, largeGems: 2 })).rejects.toThrow();
    await expect(getStickerSummary(database)).resolves.toMatchObject({ gems: 0, largeGems: 0 });
  });
  it('serializes count edits with widget/task completion transactions', async () => {
    const id = await task();
    await Promise.all([updateGemCounts(database, { gems: 8, largeGems: 2 }), setTaskCompletionWithRewards(database, id, '2026-10-04', 0, true), updateGemCounts(database, { gems: 3, largeGems: 1 })]);
    await expect(getStickerSummary(database)).resolves.toMatchObject({ gems: 3, largeGems: 1 });
  });
  it('does not mark a task-free day complete', async () => {
    await editTaskWithRewards(database, '2026-10-04', 0, async () => undefined);
    expect(await getCompletedDates(database)).toEqual([]);
  });
  it('keeps manually entered counts after reopening the database', async () => {
    await withTempDirectory('manual-gems-', async (_directory, pathOf) => {
      const path = pathOf('gems.db');
      const first = openTestDatabase(path);
      await migrateDatabase(first); await updateGemCounts(first, { gems: 12, largeGems: 4 }); first.close();
      const reopened = openTestDatabase(path);
      try { await expect(getStickerSummary(reopened)).resolves.toMatchObject({ gems: 12, largeGems: 4 }); }
      finally { reopened.close(); }
    });
  });
});
