import { editTaskWithRewards, revokeTodayCompletion, setTaskCompletionWithRewards } from '../src/db/rewardRepository';

type Ledger = { reason: string; delta: number };

function databaseFor(ledger: Ledger[] = [], full = true) {
  const transactions: string[] = [];
  return {
    database: {
      execAsync: async (source: string) => { transactions.push(source); },
      getFirstAsync: async <T>(source: string, ...params: unknown[]) => {
        if (source.includes('LEFT JOIN task_completions')) return { count: full ? 0 : 1 } as T;
        if (source.includes('SELECT COUNT(*) AS count FROM tasks')) return { count: 1 } as T;
        if (source.includes('SELECT id FROM sticker_ledger')) return (ledger.some((row) => row.reason === params[1]) ? { id: 1 } : null) as T | null;
        return null;
      },
      getAllAsync: async <T>(source: string) => ledger.filter((row) => row.reason.startsWith(source.includes('ORDER BY') ? 'daily-completion:' : 'gem-reward:')).map(({ reason }) => ({ reason } as T)),
      runAsync: async (source: string, ...params: unknown[]) => {
        if (source.startsWith('INSERT INTO sticker_ledger')) ledger.push({ delta: Number(params[2]), reason: String(params[3]) });
        if (source.startsWith('DELETE FROM sticker_ledger') && params[1] === 'gem-reward:%') {
          for (let index = ledger.length - 1; index >= 0; index -= 1) if (ledger[index].reason.startsWith('gem-reward:')) ledger.splice(index, 1);
        }
        if (source.startsWith('DELETE FROM sticker_ledger') && String(params[1]).startsWith('gem-reward:')) {
          for (let index = ledger.length - 1; index >= 0; index -= 1) if (ledger[index].reason === params[1]) ledger.splice(index, 1);
        }
        if (source.startsWith('DELETE FROM sticker_ledger') && String(params[1]).startsWith('daily-completion:')) {
          for (let index = ledger.length - 1; index >= 0; index -= 1) if (ledger[index].reason === params[1]) ledger.splice(index, 1);
        }
      },
    },
    ledger,
    transactions,
  };
}

describe('daily completion rewards', () => {
  it('records a full day without an individual-day reward', async () => {
    const { database, ledger, transactions } = databaseFor();
    await expect(setTaskCompletionWithRewards(database, 1, '2026-09-19', 6, true)).resolves.toBeNull();
    await expect(setTaskCompletionWithRewards(database, 1, '2026-09-19', 6, true)).resolves.toBeNull();
    expect(ledger).toEqual([
      { reason: 'daily-completion:2026-09-19', delta: 0 },
    ]);
    expect(transactions).toEqual(['BEGIN IMMEDIATE', 'COMMIT', 'BEGIN IMMEDIATE', 'COMMIT']);
  });

  it('removes a cancelled completion and rebuilds affected rewards', async () => {
    const { database, ledger, transactions } = databaseFor([
      { reason: 'daily-completion:2026-09-19', delta: 0 },
    ]);
    await revokeTodayCompletion(database, '2026-09-19');
    expect(ledger).toEqual([]);
    expect(transactions).toEqual(['BEGIN IMMEDIATE', 'COMMIT']);
  });

  it('awards a complete week and rebuilds a complete month when a day is cancelled', async () => {
    const weekDates = Array.from({ length: 6 }, (_, index) => `daily-completion:2026-09-${String(index + 13).padStart(2, '0')}`);
    const weekly = databaseFor(weekDates.map((reason) => ({ reason, delta: 0 })));
    await expect(setTaskCompletionWithRewards(weekly.database, 1, '2026-09-19', 6, true)).resolves.toEqual({ kind: 'gem', amount: 1, period: 'week' });
    expect(weekly.ledger).toContainEqual({ reason: 'gem-reward:week:2026-09-19:gem', delta: 1 });
    const dates = Array.from({ length: 29 }, (_, index) => `daily-completion:2026-09-${String(index + 1).padStart(2, '0')}`);
    const { database, ledger } = databaseFor(dates.map((reason) => ({ reason, delta: 0 })));
    await expect(setTaskCompletionWithRewards(database, 1, '2026-09-30', 3, true)).resolves.toEqual({ kind: 'large-gem', amount: 1, period: 'month' });
    expect(ledger).toContainEqual({ reason: 'gem-reward:month:2026-09-30:large-gem', delta: 1 });
    await revokeTodayCompletion(database, '2026-09-15');
    expect(ledger.some((row) => row.reason.includes('gem-reward:month:'))).toBe(false);
  });

  it('records a newly complete day inside the task edit transaction', async () => {
    const { database, ledger, transactions } = databaseFor();
    await editTaskWithRewards(database, '2026-09-19', 6, async () => undefined);
    expect(ledger).toContainEqual({ reason: 'daily-completion:2026-09-19', delta: 0 });
    expect(transactions).toEqual(['BEGIN IMMEDIATE', 'COMMIT']);
  });

  it('does not create a daily record while another task remains incomplete', async () => {
    const { database, ledger } = databaseFor([], false);
    await expect(setTaskCompletionWithRewards(database, 1, '2026-09-19', 6, true)).resolves.toBeNull();
    expect(ledger).toEqual([]);
  });

  it('awards a week when one weekday has zero tasks assigned', async () => {
    const taskFreeDates = new Set(['2026-09-19']);
    const ledger: Ledger[] = ['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'].map((date) => ({ reason: `daily-completion:${date}`, delta: 0 }));
    const database = {
      execAsync: async () => undefined,
      getFirstAsync: async <T,>(source: string, ...params: unknown[]): Promise<T> => {
        if (source.includes('LEFT JOIN task_completions')) return { count: 0 } as T;
        if (source.includes('SELECT COUNT(*) AS count FROM tasks')) return { count: taskFreeDates.has(params[1] as string) ? 0 : 1 } as T;
        if (source.includes('SELECT id FROM sticker_ledger')) return (ledger.some((row) => row.reason === params[1]) ? { id: 1 } : null) as T;
        return null as T;
      },
      getAllAsync: async <T,>(source: string): Promise<T[]> => ledger.filter((row) => row.reason.startsWith(source.includes('ORDER BY') ? 'daily-completion:' : 'gem-reward:')).map(({ reason }) => ({ reason } as T)),
      runAsync: async (source: string, ...params: unknown[]) => {
        if (source.startsWith('INSERT INTO sticker_ledger')) ledger.push({ delta: Number(params[2]), reason: String(params[3]) });
      },
    };
    await expect(setTaskCompletionWithRewards(database, 1, '2026-09-18', 5, true)).resolves.toEqual({ kind: 'gem', amount: 1, period: 'week' });
    expect(ledger).toContainEqual({ reason: 'gem-reward:week:2026-09-19:gem', delta: 1 });
  });
});
