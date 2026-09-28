import { databaseVersion, migrateDatabase, schemaV1, schemaV3, schemaV4 } from '../src/db/migrations';
import { copyTimetableWeekday, createTimetableItem, createTimetableItems, deleteTimetableItem, getEditableTimetableItemById, updateTimetableItem } from '../src/db/timetableRepository';
import { getPeriods, savePeriods } from '../src/db/periodRepository';
import { getDayExceptionsInRange } from '../src/db/dayExceptionRepository';
import { getActiveTimetableMode, setActiveTimetableMode } from '../src/db/timetableModeRepository';

function migrationDatabase(version: number) {
  const calls: string[] = [];
  return {
    calls,
    execAsync: jest.fn(async (statement: string) => { calls.push(statement); }),
    getFirstAsync: async <T,>() => ({ user_version: version } as T),
  };
}

describe('timetable database migration', () => {
  it('creates the three tables and records the schema version in one transaction', async () => {
    const database = migrationDatabase(0);

    await migrateDatabase(database);

    expect(database.calls[0]).toBe('BEGIN IMMEDIATE');
    expect(database.calls).toEqual(expect.arrayContaining(schemaV1));
    expect(database.calls).toContain(`PRAGMA user_version = ${databaseVersion}`);
    expect(database.calls.at(-1)).toBe('COMMIT');
    expect(schemaV1.join('\n')).toContain('color_key TEXT NOT NULL');
    expect(schemaV1.join('\n')).toContain('icon_key TEXT NOT NULL');
    expect(schemaV1.join('\n')).toContain('family_id TEXT NOT NULL');
    expect(database.calls).toEqual(expect.arrayContaining(schemaV3));
    expect(schemaV3.join('\n')).toContain('CREATE TABLE IF NOT EXISTS task_completions');
    expect(database.calls).toEqual(expect.arrayContaining(schemaV4));
  });

  it('does not rerun an applied migration', async () => {
    const database = migrationDatabase(databaseVersion);
    await migrateDatabase(database);
    expect(database.execAsync).not.toHaveBeenCalled();
  });
});

describe('timetable item persistence', () => {
  it('keeps semantic color and icon keys instead of a rendered color value', async () => {
    const database = { runAsync: jest.fn(async () => undefined) };
    await createTimetableItem(database, {
      weekday: 1, periodNo: 2, title: '수학', category: 'school', colorKey: 'math', iconKey: 'number', alertMode: 'notify', alertBeforeMin: 5,
    });
    expect(database.runAsync).toHaveBeenCalledWith(expect.stringContaining('color_key, icon_key'), 'local-family', 1, 2, null, null, '수학', 'school', 'math', 'number', 'notify', 5, 'regular');
  });

  it('rejects an ambiguous item with both a period and a time range', async () => {
    const database = { runAsync: jest.fn(async () => undefined) };
    await expect(createTimetableItem(database, {
      weekday: 1, periodNo: 2, startTime: '09:00', endTime: '09:40', title: '수학', category: 'school', colorKey: 'math', iconKey: 'number',
    })).rejects.toThrow('both a period and a time range');
  });

  it('creates selected weekdays independently and scopes update and delete to the family', async () => {
    const database = { execAsync: jest.fn(async () => undefined), getAllAsync: jest.fn(async <T,>() => [{ count: 2 }] as T[]), runAsync: jest.fn(async () => undefined) };
    const item = { periodNo: 1, title: '국어', category: 'school' as const, colorKey: 'korean' as const, iconKey: 'text' as const };
    await createTimetableItems(database, [1, 3, 1], item);
    await updateTimetableItem(database, 4, { ...item, weekday: 2, title: '수정' });
    await deleteTimetableItem(database, 4);
    expect(database.runAsync).toHaveBeenCalledTimes(4);
    const calls = database.runAsync.mock.calls as unknown[][];
    expect(calls[0].slice(1, 4)).toEqual(['local-family', 1, 1]);
    expect(calls[1].slice(1, 4)).toEqual(['local-family', 3, 1]);
    expect(calls[2][0]).toContain('WHERE id = ? AND family_id = ? AND timetable_mode = ?');
    expect(calls[3]).toEqual(['DELETE FROM timetable_items WHERE id = ? AND family_id = ? AND timetable_mode = ?', 4, 'local-family', 'regular']);
  });

  it('replaces the target weekday with an exact copy in one transaction', async () => {
    const database = { execAsync: jest.fn(async () => undefined), getAllAsync: async <T,>() => [{ count: 2 }] as unknown as T[], runAsync: jest.fn(async () => undefined) };
    await copyTimetableWeekday(database, 1, 3);
    expect(database.execAsync.mock.calls).toEqual([['BEGIN IMMEDIATE'], ['COMMIT']]);
    const calls = database.runAsync.mock.calls as unknown[][];
    expect(calls[0]).toEqual(['DELETE FROM timetable_items WHERE family_id = ? AND weekday = ? AND timetable_mode = ?', 'local-family', 3, 'regular']);
    expect(calls[1][0]).toContain('SELECT family_id, ?');
    await expect(copyTimetableWeekday(database, 1, 1)).rejects.toThrow('must differ');
    await expect(copyTimetableWeekday({ ...database, getAllAsync: async <T,>() => [{ count: 0 }] as unknown as T[] }, 1, 3)).rejects.toThrow('source weekday has no items');
  });

  it('loads a period item with its resolved period times for an alarm link', async () => {
    const calls: unknown[][] = [];
    const database = { getFirstAsync: async <T,>(...args: unknown[]) => { calls.push(args); return { id: 4, title: '수학', startTime: '10:00', endTime: '10:40' } as T; } };
    await expect(getEditableTimetableItemById(database, 4)).resolves.toMatchObject({ id: 4, startTime: '10:00', endTime: '10:40' });
    expect(calls[0]).toEqual([expect.stringContaining('COALESCE(periods.start_time, timetable_items.start_time)'), 4, 'local-family']);
  });
});

describe('vacation timetable mode', () => {
  it('stores the selected mode and keeps regular as the empty-state default', async () => {
    const calls: unknown[][] = [];
    const database = {
      getFirstAsync: async <T,>(...args: unknown[]) => { calls.push(args); return null as T | null; },
      runAsync: async (...args: unknown[]) => { calls.push(args); },
    };
    await expect(getActiveTimetableMode(database)).resolves.toBe('regular');
    await setActiveTimetableMode(database, 'vacation');
    expect(calls[1]).toEqual([expect.stringContaining('timetable_settings'), 'local-family', 'vacation']);
  });
});

describe('period persistence', () => {
  it('updates existing periods without deleting referenced rows, then reads them in order', async () => {
    const rows = new Map([[1, { periodNo: 1, startTime: '09:00', endTime: '09:40' }]]);
    const database = {
      execAsync: jest.fn(async () => undefined),
      runAsync: jest.fn(async (_sql: string, _familyId: string, periodNo: number, startTime: string, endTime: string) => {
        rows.set(periodNo, { periodNo, startTime, endTime });
      }),
      getAllAsync: async <T,>() => [...rows.values()].sort((left, right) => left.periodNo - right.periodNo) as T[],
    };
    await savePeriods(database, [
      { periodNo: 1, startTime: '09:10', endTime: '09:50' },
      { periodNo: 2, startTime: '10:00', endTime: '10:40' },
    ]);
    await expect(getPeriods(database)).resolves.toEqual([
      { periodNo: 1, startTime: '09:10', endTime: '09:50' },
      { periodNo: 2, startTime: '10:00', endTime: '10:40' },
    ]);
    expect(database.runAsync).toHaveBeenCalledTimes(2);
    expect(database.runAsync.mock.calls[0][0]).toContain('ON CONFLICT(family_id, period_no) DO UPDATE');
  });
});

describe('day exceptions', () => {
  it('loads exceptions that overlap the rolling notification window', async () => {
    const calls: unknown[][] = [];
    const database = { getAllAsync: async <T,>(...args: unknown[]) => { calls.push(args); return [{ startDate: '2026-09-20', endDate: '2026-09-22' }] as unknown as T[]; } };
    await expect(getDayExceptionsInRange(database, '2026-09-18', '2026-09-24')).resolves.toEqual([{ startDate: '2026-09-20', endDate: '2026-09-22' }]);
    expect(calls[0]).toEqual([expect.stringContaining('start_date <= ? AND end_date >= ?'), 'local-family', '2026-09-24', '2026-09-18']);
  });
});

