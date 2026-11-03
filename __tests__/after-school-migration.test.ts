/** @jest-environment node */
import * as migrations from '../src/db/migrations';
import { createTimetableItem, copyTimetableWeekday, getEditableTimetableItems } from '../src/db/timetableRepository';
import { createTimetableSet, getActiveTimetableSet } from '../src/db/timetableSetRepository';
import { buildWidgetData } from '../src/widgets/widgetDataV2';
import { defaultTheme } from '../src/theme';
import { openTestDatabase } from '../test-utils/sqliteTestDatabase';

it('V13의 모든 일정 값을 보존하고 방과후 저장·복사·위젯 및 외래키를 지원한다', async () => {
  const db = openTestDatabase();
  try {
    const schemas = Object.entries(migrations).filter(([key]) => /^schemaV\d+$/.test(key))
      .sort(([a], [b]) => Number(a.slice(7)) - Number(b.slice(7)));
    for (const [, statements] of schemas) for (const sql of statements as readonly string[]) await db.execAsync(sql);
    await db.execAsync('PRAGMA user_version = 13');
    const set = (await getActiveTimetableSet(db)).id;
    const input = { setId: set, weekday: 4, title: '기존 학원', category: 'academy' as const, startTime: '14:00', endTime: '14:40', colorKey: 'science' as const, iconKey: 'experiment' as const, memo: '픽업 14:40', alertMode: 'alarm' as const, alertBeforeMin: 5 };
    await createTimetableItem(db, input);
    const before = await db.getAllAsync('SELECT * FROM timetable_items ORDER BY id');
    await expect(createTimetableItem(db, { ...input, category: 'after_school' })).rejects.toThrow();
    await migrations.migrateDatabase(db);
    expect(await db.getAllAsync('SELECT * FROM timetable_items ORDER BY id')).toEqual(before);
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 14 });
    await createTimetableItem(db, { ...input, category: 'after_school', title: '방과후 과학' });
    await copyTimetableWeekday(db, 4, 5, set);
    const copy = await createTimetableSet(db, '복제', { copyFromSetId: set });
    expect((await getEditableTimetableItems(db, copy)).filter((row) => row.category === 'after_school')).toHaveLength(2);
    await createTimetableItem(db, { ...input, title: '정규수업', category: 'school' });
    const widget = await buildWidgetData(db, defaultTheme, new Date(2026, 9, 22));
    expect(widget.days[0].schedule.map((row) => row.title)).toEqual(['기존 학원', '방과후 과학']);
    expect(await db.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
    expect(await db.getAllAsync("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='timetable_items'")).toHaveLength(4);
    await db.runAsync('DELETE FROM timetable_sets WHERE id = ?', copy);
    expect(await getEditableTimetableItems(db, copy)).toEqual([]);
    await expect(db.runAsync("UPDATE timetable_items SET category = 'unknown'")).rejects.toThrow();
    const saved = await getEditableTimetableItems(db, set);
    await migrations.migrateDatabase(db);
    expect(await getEditableTimetableItems(db, set)).toEqual(saved);
  } finally { db.close(); }
});
