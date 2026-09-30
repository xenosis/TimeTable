/** @jest-environment node */
import {
  databaseVersion, migrateDatabase, schemaV1, schemaV2, schemaV3, schemaV4, schemaV5, schemaV6, schemaV7, schemaV8, schemaV9,
} from '../src/db/migrations';
import { copyTimetableWeekday, createTimetableItem, getEditableTimetableItems } from '../src/db/timetableRepository';
import { createTimetableSet, getActiveTimetableSet } from '../src/db/timetableSetRepository';
import type { TimetableItemInput } from '../src/db/types';
import { defaultTheme } from '../src/theme';
import { buildWidgetData } from '../src/widgets/widgetDataV2';
import { openTestDatabase } from '../test-utils/sqliteTestDatabase';

type Database = ReturnType<typeof openTestDatabase>;

const item = (setId: number, title: string, category: TimetableItemInput['category'], weekday = 3): TimetableItemInput => ({
  weekday, startTime: '10:00', endTime: '11:00', title, category, colorKey: 'life', iconKey: 'life', setId,
});

/** 옛 스키마(V9)까지만 적용한 DB를 만든다. */
async function databaseAtV9(): Promise<Database> {
  const database = openTestDatabase();
  for (const statements of [schemaV1, schemaV2, schemaV3, schemaV4, schemaV5, schemaV6, schemaV7, schemaV8, schemaV9]) {
    for (const statement of statements) await database.execAsync(statement);
  }
  await database.execAsync('PRAGMA user_version = 9');
  await database.runAsync("INSERT INTO periods (period_no, start_time, end_time) VALUES (1, '09:00', '09:40')");
  return database;
}

describe('마이그레이션 V10: 일정 종류에 돌봄 추가', () => {
  it('기존 항목의 모든 컬럼과 세트 연결을 그대로 보존한다', async () => {
    const database = openTestDatabase();
    for (const statements of [schemaV1, schemaV2, schemaV3, schemaV4, schemaV5, schemaV6, schemaV7, schemaV8]) {
      for (const statement of statements) await database.execAsync(statement);
    }
    await database.execAsync('PRAGMA user_version = 8');
    await database.runAsync("INSERT INTO periods (period_no, start_time, end_time) VALUES (1, '09:00', '09:40')");
    const insert = `INSERT INTO timetable_items (weekday, period_no, start_time, end_time, title, category, color_key, icon_key, alert_mode, alert_before_min, timetable_mode)
      VALUES (?, ?, ?, ?, ?, ?, 'math', 'number', ?, ?, ?)`;
    await database.runAsync(insert, 1, 1, null, null, '1교시 국어', 'school', 'notify', 5, 'regular');
    await database.runAsync(insert, 3, null, '17:00', '18:00', '피아노', 'academy', 'alarm', 10, 'regular');
    await database.runAsync(insert, 3, null, '10:00', '15:00', '방학 캠프', 'life', 'none', 0, 'vacation');
    await database.runAsync("INSERT INTO timetable_settings (family_id, active_mode) VALUES ('local-family', 'vacation')");
    const before = await database.getAllAsync<Record<string, unknown>>('SELECT id, family_id, created_at, weekday, period_no, start_time, end_time, title, category, color_key, icon_key, alert_mode, alert_before_min, timetable_mode FROM timetable_items ORDER BY id');

    await migrateDatabase(database); // V8 → V9 → V10 한 번에

    expect((await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(databaseVersion);
    const after = await database.getAllAsync<Record<string, unknown>>('SELECT id, family_id, created_at, weekday, period_no, start_time, end_time, title, category, color_key, icon_key, alert_mode, alert_before_min, timetable_mode FROM timetable_items ORDER BY id');
    expect(after).toEqual(before); // 값이 하나도 바뀌지 않았다
    // 세트 연결(V9)도 살아 있다: 평소 2개, 방학 1개
    const perSet = await database.getAllAsync<{ name: string; count: number }>('SELECT timetable_sets.name AS name, COUNT(*) AS count FROM timetable_items JOIN timetable_sets ON timetable_sets.id = timetable_items.set_id GROUP BY timetable_sets.name ORDER BY timetable_sets.name');
    expect(perSet).toEqual([{ name: '방학', count: 1 }, { name: '평소', count: 2 }]);
  });

  it('V9 상태에서 데이터가 있는 DB에 V10만 적용해도 set_id를 포함한 모든 컬럼이 보존된다', async () => {
    const database = await databaseAtV9();
    const columns = 'id, family_id, created_at, weekday, period_no, start_time, end_time, title, category, color_key, icon_key, alert_mode, alert_before_min, timetable_mode, set_id';
    const sets = await database.getAllAsync<{ id: number }>('SELECT id FROM timetable_sets ORDER BY id');
    const insert = `INSERT INTO timetable_items (weekday, period_no, start_time, end_time, title, category, color_key, icon_key, alert_mode, alert_before_min, set_id)
      VALUES (?, ?, ?, ?, ?, ?, 'math', 'number', ?, ?, ?)`;
    await database.runAsync(insert, 2, 1, null, null, '국어', 'school', 'notify', 5, sets[0].id);
    await database.runAsync(insert, 4, null, '17:00', '18:00', '태권도', 'academy', 'alarm', 10, sets[sets.length - 1].id);
    const before = await database.getAllAsync<Record<string, unknown>>(`SELECT ${columns} FROM timetable_items ORDER BY id`);
    await migrateDatabase(database);
    expect(await database.getAllAsync(`SELECT ${columns} FROM timetable_items ORDER BY id`)).toEqual(before);
  });

  it('돌봄 종류를 저장할 수 있고 잘못된 종류는 여전히 거절한다', async () => {
    const database = await databaseAtV9();
    await migrateDatabase(database);
    const set = (await getActiveTimetableSet(database)).id;
    await createTimetableItem(database, item(set, '방과후 돌봄', 'care'));
    expect((await getEditableTimetableItems(database, set)).map(({ title, category }) => [title, category])).toEqual([['방과후 돌봄', 'care']]);
    await expect(database.runAsync("INSERT INTO timetable_items (weekday, start_time, end_time, title, category, color_key, icon_key, set_id) VALUES (1, '10:00', '11:00', 'x', 'nope', 'math', 'number', ?)", set)).rejects.toThrow(/CHECK/);
  });

  it('옛 제약(학교·학원·생활)도 그대로 동작한다', async () => {
    const database = await databaseAtV9();
    await migrateDatabase(database);
    const set = (await getActiveTimetableSet(database)).id;
    for (const category of ['school', 'academy', 'life'] as const) await createTimetableItem(database, item(set, category, category));
    expect((await getEditableTimetableItems(database, set)).map(({ category }) => category).sort()).toEqual(['academy', 'life', 'school']);
  });

  it('인덱스 4개가 다시 만들어지고 세트 연결(외래키)이 유지된다', async () => {
    const database = await databaseAtV9();
    await migrateDatabase(database);
    const indexes = (await database.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'timetable_items' AND name LIKE 'timetable_items_%' ORDER BY name")).map(({ name }) => name);
    expect(indexes).toEqual(['timetable_items_mode_weekday', 'timetable_items_set_weekday', 'timetable_items_weekday_period', 'timetable_items_weekday_time']);
    const summer = await createTimetableSet(database, '여름');
    await createTimetableItem(database, item(summer, '캠프', 'care'));
    await database.runAsync('DELETE FROM timetable_sets WHERE id = ?', summer); // ON DELETE CASCADE가 살아 있어야 한다
    expect(await database.getFirstAsync('SELECT id FROM timetable_items WHERE title = ?', '캠프')).toBeNull();
  });

  it('세트 복제와 요일 복사에서 돌봄 종류가 유지된다', async () => {
    const database = await databaseAtV9();
    await migrateDatabase(database);
    const set = (await getActiveTimetableSet(database)).id;
    await createTimetableItem(database, item(set, '돌봄', 'care', 1));
    await copyTimetableWeekday(database, 1, 2, set);
    expect((await getEditableTimetableItems(database, set)).map(({ weekday, category }) => [weekday, category])).toEqual([[1, 'care'], [2, 'care']]);
    const copy = await createTimetableSet(database, '복제', { copyFromSetId: set });
    expect((await getEditableTimetableItems(database, copy)).every(({ category }) => category === 'care')).toBe(true);
  });

  it('이미 최신인 DB에서 다시 실행해도 아무것도 바꾸지 않는다', async () => {
    const database = openTestDatabase();
    await migrateDatabase(database);
    const set = (await getActiveTimetableSet(database)).id;
    await createTimetableItem(database, item(set, '돌봄', 'care'));
    await migrateDatabase(database);
    expect(await getEditableTimetableItems(database, set)).toHaveLength(1);
  });

  it('위젯 데이터에는 돌봄이 포함되고 학교만 빠진다', async () => {
    const database = openTestDatabase();
    await migrateDatabase(database);
    const set = (await getActiveTimetableSet(database)).id;
    const today = new Date(2026, 8, 30);
    await createTimetableItem(database, item(set, '정규 수업', 'school'));
    await createTimetableItem(database, item(set, '방과후 돌봄', 'care'));
    await createTimetableItem(database, item(set, '피아노', 'academy'));
    const { days } = await buildWidgetData(database, defaultTheme, today);
    expect(days[0].schedule.map(({ title }) => title).sort()).toEqual(['방과후 돌봄', '피아노']);
  });
});
