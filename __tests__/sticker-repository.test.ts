import { addRewardGoal, getStickerSummary, markRewardAchieved } from '../src/db/stickerRepository';

type LedgerRow = { readonly reason: string; readonly delta: number };

function fakeRewardDatabase(initialLedger: readonly LedgerRow[] = []) {
  const ledger: LedgerRow[] = [...initialLedger];
  const runAsyncCalls: unknown[][] = [];
  return {
    runAsync: async (sql: string, ...params: unknown[]) => {
      runAsyncCalls.push([sql, ...params]);
      if (sql.startsWith('INSERT INTO sticker_ledger')) ledger.push({ reason: params[3] as string, delta: params[2] as number });
      return { changes: 1 };
    },
    getAllAsync: async <T,>() => ledger as unknown as T[],
    getFirstAsync: async <T,>() => null as T,
    calls: () => runAsyncCalls,
  };
}

describe('sticker summary', () => {
  it('adds the ledger and reports the remaining reward goal', async () => {
    const database = { getAllAsync: async <T,>() => [{ reason: 'gem-reward:week:2026-09-19:gem', delta: 3 }] as T[], getFirstAsync: async <T,>() => ({ id: 9, title: '주말 영화', stickerGoal: 5 }) as T };
    await expect(getStickerSummary(database)).resolves.toEqual({ gems: 3, largeGems: 0, total: 3, goal: { id: 9, title: '주말 영화', stickerGoal: 5 }, remaining: 2 });
  });

  it('keeps goal creation in the repository', async () => {
    const calls: readonly unknown[][] = [];
    const database = { runAsync: async (_source: string, ...params: unknown[]) => { (calls as unknown[][]).push(params); } };
    await addRewardGoal(database, ' 주말 영화 ', 5);
    expect(calls).toEqual([['local-family', '주말 영화', 5]]);
  });

  it('rejects an empty title or invalid gem count', async () => {
    const database = { runAsync: async () => undefined };
    await expect(addRewardGoal(database, ' ', 5)).rejects.toThrow('보상 이름');
    await expect(addRewardGoal(database, '영화', 0)).rejects.toThrow('1 이상');
  });

  it('does not change the gem counts when a reward goal is achieved (gems are physical)', async () => {
    const database = fakeRewardDatabase([
      { reason: 'gem-reward:week:2026-09-19:gem', delta: 5 },
      { reason: 'gem-reward:month:2026-09-30:large-gem', delta: 2 },
    ]);
    await markRewardAchieved(database, 9);
    await expect(getStickerSummary(database)).resolves.toMatchObject({ gems: 5, largeGems: 2 });
    expect(database.calls().every(([sql]) => !String(sql).startsWith('INSERT INTO sticker_ledger'))).toBe(true);
  });

  it('does nothing when the reward is already achieved', async () => {
    const database = { runAsync: async () => ({ changes: 0 }) };
    await expect(markRewardAchieved(database, 9)).resolves.toBeUndefined();
  });
});
