/** @jest-environment node */
import { databaseVersion, migrateDatabase, schemaV1, schemaV2, schemaV3, schemaV4, schemaV5, schemaV6, schemaV7, schemaV8 } from '../src/db/migrations';
import {
  copyTimetableWeekday, createTimetableItem, deleteTimetableItem, getEditableTimetableItems, getTimetableItemsForWeekday, updateTimetableItem,
} from '../src/db/timetableRepository';
import {
  createTimetableSet, deleteTimetableSet, getActiveTimetableSet, listTimetableSets, renameTimetableSet, setActiveTimetableSet,
} from '../src/db/timetableSetRepository';
import type { TimetableDatabase, TimetableItemInput } from '../src/db/types';
import { openTestDatabase as openDatabase, withTempDirectory } from '../test-utils/sqliteTestDatabase';
import { buildTimetableNotificationsFromDatabase } from '../src/notifications/rollingSchedule';

const item = (setId: number, title: string, weekday = 1, start = '09:00', end = '10:00'): TimetableItemInput => ({
  weekday, startTime: start, endTime: end, title, category: 'academy', colorKey: 'math', iconKey: 'number', setId,
});

async function freshDatabase(): Promise<TimetableDatabase> {
  const database = openDatabase();
  await migrateDatabase(database);
  return database;
}

describe('마이그레이션 V9: 평소/방학 모드를 시간표 세트로', () => {
  async function legacyDatabase(activeMode: 'regular' | 'vacation', withVacationItem: boolean): Promise<TimetableDatabase> {
    const database = openDatabase();
    for (const statements of [schemaV1, schemaV2, schemaV3, schemaV4, schemaV5, schemaV6, schemaV7, schemaV8]) for (const statement of statements) await database.execAsync(statement);
    await database.execAsync('PRAGMA user_version = 8');
    const insert = "INSERT INTO timetable_items (weekday, start_time, end_time, title, category, color_key, icon_key, timetable_mode) VALUES (?, '09:00', '10:00', ?, 'academy', 'math', 'number', ?)";
    await database.runAsync(insert, 1, '피아노', 'regular');
    await database.runAsync(insert, 2, '수영', 'regular');
    if (withVacationItem) await database.runAsync(insert, 1, '캠프', 'vacation');
    await database.runAsync('INSERT INTO timetable_settings (family_id, active_mode) VALUES (?, ?)', 'local-family', activeMode);
    return database;
  }

  it('기존 평소·방학 항목을 각각 이름이 붙은 세트로 옮기고 켜져 있던 모드를 적용 중으로 남긴다', async () => {
    const database = await legacyDatabase('vacation', true);
    await migrateDatabase(database);
    expect((await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(databaseVersion);
    const sets = await listTimetableSets(database);
    expect(sets.map(({ name, itemCount }) => [name, itemCount])).toEqual([['평소', 2], ['방학', 1]]);
    const active = await getActiveTimetableSet(database);
    expect(active.name).toBe('방학');
    expect((await getEditableTimetableItems(database, active.id)).map(({ title }) => title)).toEqual(['캠프']);
    expect(await database.getFirstAsync('SELECT id FROM timetable_items WHERE set_id IS NULL')).toBeNull();
  });

  it('방학 항목도 방학 모드도 없으면 방학 세트를 만들지 않는다', async () => {
    const database = await legacyDatabase('regular', false);
    await migrateDatabase(database);
    expect((await listTimetableSets(database)).map(({ name }) => name)).toEqual(['평소']);
    expect((await getActiveTimetableSet(database)).name).toBe('평소');
  });

  it('여러 가족의 데이터도 서로 섞이지 않고 각자 세트로 옮긴다', async () => {
    const database = openDatabase();
    for (const statements of [schemaV1, schemaV2, schemaV3, schemaV4, schemaV5, schemaV6, schemaV7, schemaV8]) for (const statement of statements) await database.execAsync(statement);
    await database.execAsync('PRAGMA user_version = 8');
    const insert = "INSERT INTO timetable_items (family_id, weekday, start_time, end_time, title, category, color_key, icon_key, timetable_mode) VALUES (?, 1, '09:00', '10:00', ?, 'academy', 'math', 'number', ?)";
    await database.runAsync(insert, 'local-family', '우리 평소', 'regular');
    await database.runAsync(insert, 'other-family', '다른집 평소', 'regular');
    await database.runAsync(insert, 'other-family', '다른집 방학', 'vacation');
    await database.runAsync('INSERT INTO timetable_settings (family_id, active_mode) VALUES (?, ?)', 'other-family', 'vacation');
    await migrateDatabase(database);
    expect((await listTimetableSets(database, 'local-family')).map(({ name, itemCount }) => [name, itemCount])).toEqual([['평소', 1]]);
    expect((await listTimetableSets(database, 'other-family')).map(({ name, itemCount }) => [name, itemCount])).toEqual([['평소', 1], ['방학', 1]]);
    expect((await getActiveTimetableSet(database, 'other-family')).name).toBe('방학');
    expect((await getActiveTimetableSet(database, 'local-family')).name).toBe('평소');
  });

  it('방학 모드만 켜져 있고 방학 항목이 없어도 그 모드를 방학 세트로 유지한다', async () => {
    const database = await legacyDatabase('vacation', false);
    await migrateDatabase(database);
    expect((await listTimetableSets(database)).map(({ name, itemCount }) => [name, itemCount])).toEqual([['평소', 2], ['방학', 0]]);
    expect((await getActiveTimetableSet(database)).name).toBe('방학');
  });

  it('항목이 없는 새 설치도 평소 세트 하나로 시작한다', async () => {
    const database = await freshDatabase();
    expect((await listTimetableSets(database)).map(({ name }) => name)).toEqual(['평소']);
  });
});

describe('시간표 세트 저장소', () => {
  it('세트마다 항목이 섞이지 않는다', async () => {
    const database = await freshDatabase();
    const first = (await getActiveTimetableSet(database)).id;
    const second = await createTimetableSet(database, '여름방학');
    await createTimetableItem(database, item(first, '1학기 수학'));
    await createTimetableItem(database, item(second, '캠프'));
    expect((await getTimetableItemsForWeekday(database, 1, first)).map(({ title }) => title)).toEqual(['1학기 수학']);
    expect((await getTimetableItemsForWeekday(database, 1, second)).map(({ title }) => title)).toEqual(['캠프']);
  });

  it('복제한 세트는 같은 항목으로 시작하고 이후 서로 영향을 주지 않는다', async () => {
    const database = await freshDatabase();
    const first = (await getActiveTimetableSet(database)).id;
    await createTimetableItem(database, item(first, '피아노', 1));
    await createTimetableItem(database, item(first, '수영', 2));
    const copy = await createTimetableSet(database, '2학기', { copyFromSetId: first });
    expect((await getEditableTimetableItems(database, copy)).map(({ title }) => title)).toEqual(['피아노', '수영']);
    const [copied] = await getEditableTimetableItems(database, copy);
    await deleteTimetableItem(database, copied.id, copy);
    expect(await getEditableTimetableItems(database, copy)).toHaveLength(1);
    expect(await getEditableTimetableItems(database, first)).toHaveLength(2);
  });

  it('요일 복사 등으로 이미 사라진 항목을 수정·삭제하면 저장 성공으로 보이지 않고 오류가 난다(P9.7 리뷰 M-A)', async () => {
    const database = await freshDatabase();
    const setId = (await getActiveTimetableSet(database)).id;
    await createTimetableItem(database, item(setId, '수학', 3));
    await createTimetableItem(database, item(setId, '국어', 2));
    const [math] = (await getEditableTimetableItems(database, setId)).filter(({ title }) => title === '수학');
    await copyTimetableWeekday(database, 2, 3, setId); // 수요일 '수학'이 지워지고 화요일 항목으로 바뀐다
    await expect(updateTimetableItem(database, math.id, item(setId, '수학2', 3))).rejects.toThrow('항목이 이미 변경되었거나 없어요.');
    await expect(deleteTimetableItem(database, math.id, setId)).rejects.toThrow('항목이 이미 변경되었거나 없어요.');
  });

  it('요일 복사는 적용한 세트 안에서만 대상 요일을 바꾼다', async () => {
    const database = await freshDatabase();
    const first = (await getActiveTimetableSet(database)).id;
    const second = await createTimetableSet(database, '방학');
    await createTimetableItem(database, item(first, '월요일 수업', 1));
    await createTimetableItem(database, item(first, '수요일 기존', 3));
    await createTimetableItem(database, item(second, '방학 수요일', 3));
    await copyTimetableWeekday(database, 1, 3, first);
    expect((await getTimetableItemsForWeekday(database, 3, first)).map(({ title }) => title)).toEqual(['월요일 수업']);
    expect((await getTimetableItemsForWeekday(database, 3, second)).map(({ title }) => title)).toEqual(['방학 수요일']);
  });

  it('이름은 비어 있거나 길거나 겹치면 거절하고, 이름을 바꿀 수 있다', async () => {
    const database = await freshDatabase();
    const first = (await getActiveTimetableSet(database)).id;
    await expect(createTimetableSet(database, '   ')).rejects.toThrow('이름을 입력');
    await expect(createTimetableSet(database, 'ㄱ'.repeat(21))).rejects.toThrow('20자');
    await expect(createTimetableSet(database, '평소')).rejects.toThrow('같은 이름');
    const second = await createTimetableSet(database, ' 1학기 ');
    expect((await listTimetableSets(database)).map(({ name }) => name)).toEqual(['평소', '1학기']);
    await expect(renameTimetableSet(database, second, '평소')).rejects.toThrow('같은 이름');
    await renameTimetableSet(database, second, '2학기');
    await renameTimetableSet(database, first, '평소');
    expect((await listTimetableSets(database)).map(({ name }) => name)).toEqual(['평소', '2학기']);
    await expect(renameTimetableSet(database, 999, '없음')).rejects.toThrow('없는 시간표');
  });

  it('적용한 세트를 다시 읽으면 그대로이고, 없는 세트는 적용할 수 없다', async () => {
    const database = await freshDatabase();
    const second = await createTimetableSet(database, '방학');
    await setActiveTimetableSet(database, second);
    expect((await getActiveTimetableSet(database)).id).toBe(second);
    await expect(setActiveTimetableSet(database, 999)).rejects.toThrow('없는 시간표');
    expect((await getActiveTimetableSet(database)).id).toBe(second);
  });

  it('앱을 완전히 닫았다 다시 열어도 마지막에 적용한 세트가 유지된다', () => withTempDirectory('timetable-sets-', async (_directory, pathOf) => {
    const path = pathOf('timetable.db');
    const first = openDatabase(path);
    await migrateDatabase(first);
    const summer = await createTimetableSet(first, '여름방학');
    await createTimetableItem(first, item(summer, '캠프'));
    await setActiveTimetableSet(first, summer);
    first.close();
    const reopened = openDatabase(path);
    await migrateDatabase(reopened); // 앱 시작 때마다 실행되는 마이그레이션이 데이터를 건드리지 않아야 한다
    const active = await getActiveTimetableSet(reopened);
    expect(active).toEqual({ id: summer, name: '여름방학' });
    expect((await getTimetableItemsForWeekday(reopened, 1, active.id)).map(({ title }) => title)).toEqual(['캠프']);
    reopened.close();
  }));

  it('적용 기록이 사라져도 가장 먼저 만든 세트로 되돌아온다', async () => {
    const database = await freshDatabase();
    await createTimetableSet(database, '방학');
    await database.runAsync('UPDATE timetable_settings SET active_set_id = NULL');
    expect((await getActiveTimetableSet(database)).name).toBe('평소');
  });

  it('지금 쓰는 세트는 지울 수 없고, 다른 세트를 지우면 그 항목도 함께 사라진다', async () => {
    const database = await freshDatabase();
    const first = (await getActiveTimetableSet(database)).id;
    const second = await createTimetableSet(database, '방학');
    await createTimetableItem(database, item(first, '유지'));
    await createTimetableItem(database, item(second, '삭제될 항목'));
    await expect(deleteTimetableSet(database, first)).rejects.toThrow('지금 쓰는 시간표');
    await expect(deleteTimetableSet(database, 999)).rejects.toThrow('없는 시간표');
    await deleteTimetableSet(database, second);
    expect((await listTimetableSets(database)).map(({ name }) => name)).toEqual(['평소']);
    expect(await database.getFirstAsync('SELECT id FROM timetable_items WHERE title = ?', '삭제될 항목')).toBeNull();
    expect(await getEditableTimetableItems(database, first)).toHaveLength(1);
  });

  it('알림 예약은 적용 중인 세트의 항목만 대상으로 한다', async () => {
    const database = await freshDatabase();
    const first = (await getActiveTimetableSet(database)).id;
    const second = await createTimetableSet(database, '방학');
    const withAlert = (setId: number, title: string): TimetableItemInput => ({ ...item(setId, title, 3), alertMode: 'notify' });
    await createTimetableItem(database, withAlert(first, '평소 알림'));
    await createTimetableItem(database, withAlert(second, '방학 알림'));
    const now = new Date(2026, 8, 30, 8, 0);
    const titles = (await buildTimetableNotificationsFromDatabase(database, first, now)).map(({ title }) => title);
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.every((title) => title.includes('평소 알림'))).toBe(true);
  });
});
