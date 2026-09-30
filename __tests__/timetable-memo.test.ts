/** @jest-environment node */
import {
  databaseVersion, migrateDatabase, schemaV1, schemaV2, schemaV3, schemaV4, schemaV5, schemaV6, schemaV7, schemaV8, schemaV9, schemaV10,
} from '../src/db/migrations';
import {
  copyTimetableWeekday, createTimetableItem, createTimetableItems, getEditableTimetableItemById, getEditableTimetableItems, getTimetableItemsForWeekday, MAX_MEMO_LENGTH, updateTimetableItem,
} from '../src/db/timetableRepository';
import { createTimetableSet, getActiveTimetableSet } from '../src/db/timetableSetRepository';
import type { TimetableItemInput } from '../src/db/types';
import { openTestDatabase } from '../test-utils/sqliteTestDatabase';

type Database = ReturnType<typeof openTestDatabase>;

const item = (setId: number, title: string, memo?: string, weekday = 3): TimetableItemInput => ({
  weekday, startTime: '16:00', endTime: '17:00', title, category: 'academy', colorKey: 'math', iconKey: 'number', setId, memo,
});

async function freshDatabase(): Promise<Database> {
  const database = openTestDatabase();
  await migrateDatabase(database);
  return database;
}

describe('마이그레이션 V11: 메모 컬럼', () => {
  it('기존 항목의 값을 그대로 두고 빈 메모를 채운다', async () => {
    const database = openTestDatabase();
    for (const statements of [schemaV1, schemaV2, schemaV3, schemaV4, schemaV5, schemaV6, schemaV7, schemaV8, schemaV9, schemaV10]) {
      for (const statement of statements) await database.execAsync(statement);
    }
    await database.execAsync('PRAGMA user_version = 10');
    const setId = (await database.getFirstAsync<{ id: number }>("SELECT id FROM timetable_sets WHERE name = '평소'"))!.id;
    await database.runAsync(
      "INSERT INTO timetable_items (weekday, start_time, end_time, title, category, color_key, icon_key, alert_mode, alert_before_min, set_id) VALUES (3, '17:00', '18:00', '피아노', 'academy', 'math', 'number', 'alarm', 10, ?)", setId,
    );
    const columns = 'id, family_id, created_at, weekday, period_no, start_time, end_time, title, category, color_key, icon_key, alert_mode, alert_before_min, set_id';
    const before = await database.getAllAsync<Record<string, unknown>>(`SELECT ${columns} FROM timetable_items ORDER BY id`);

    await migrateDatabase(database);

    expect((await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(databaseVersion);
    expect(await database.getAllAsync(`SELECT ${columns} FROM timetable_items ORDER BY id`)).toEqual(before);
    expect(await database.getAllAsync<{ memo: string }>('SELECT memo FROM timetable_items')).toEqual([{ memo: '' }]);
  });

  it('이미 최신인 DB에서 다시 실행해도 메모가 그대로다', async () => {
    const database = await freshDatabase();
    const setId = (await getActiveTimetableSet(database)).id;
    await createTimetableItem(database, item(setId, '피아노', '선생님 데리러'));
    await migrateDatabase(database);
    expect((await getEditableTimetableItems(database, setId))[0].memo).toBe('선생님 데리러');
  });
});

describe('메모 저장·수정·조회', () => {
  it('저장한 메모를 편집용·요일별 조회에서 모두 돌려준다', async () => {
    const database = await freshDatabase();
    const setId = (await getActiveTimetableSet(database)).id;
    await createTimetableItem(database, item(setId, '일루스터', '일루스터 16:45 차'));
    const [editable] = await getEditableTimetableItems(database, setId);
    expect(editable.memo).toBe('일루스터 16:45 차');
    expect((await getEditableTimetableItemById(database, editable.id))?.memo).toBe('일루스터 16:45 차');
    expect((await getTimetableItemsForWeekday(database, 3, setId))[0].memo).toBe('일루스터 16:45 차');
  });

  it('메모가 없으면 빈 문자열이고, 앞뒤 공백은 지워서 저장한다', async () => {
    const database = await freshDatabase();
    const setId = (await getActiveTimetableSet(database)).id;
    await createTimetableItem(database, item(setId, '메모 없음'));
    await createTimetableItem(database, item(setId, '공백뿐', '   '));
    await createTimetableItem(database, item(setId, '공백 섞임', '  차 타고 이동  '));
    expect((await getEditableTimetableItems(database, setId)).map(({ memo }) => memo)).toEqual(['', '', '차 타고 이동']);
  });

  it('수정으로 메모를 바꾸고 지울 수 있다', async () => {
    const database = await freshDatabase();
    const setId = (await getActiveTimetableSet(database)).id;
    await createTimetableItem(database, item(setId, '피아노', '처음'));
    const id = (await getEditableTimetableItems(database, setId))[0].id;
    await updateTimetableItem(database, id, item(setId, '피아노', '바뀐 메모'));
    expect((await getEditableTimetableItemById(database, id))?.memo).toBe('바뀐 메모');
    await updateTimetableItem(database, id, item(setId, '피아노', ''));
    expect((await getEditableTimetableItemById(database, id))?.memo).toBe('');
  });

  it('메모를 넘기지 않고 수정하면 기존 메모가 그대로 남는다(메모 칸이 없는 편집 화면이 지우지 않게)', async () => {
    const database = await freshDatabase();
    const setId = (await getActiveTimetableSet(database)).id;
    await createTimetableItem(database, item(setId, '피아노', '차 타고 이동'));
    const id = (await getEditableTimetableItems(database, setId))[0].id;
    const { memo: _memo, ...withoutMemo } = item(setId, '피아노 수정', '');
    await updateTimetableItem(database, id, withoutMemo);
    const saved = await getEditableTimetableItemById(database, id);
    expect(saved?.title).toBe('피아노 수정');
    expect(saved?.memo).toBe('차 타고 이동');
  });

  it('메모는 최대 60글자이고 한글·이모지도 한 글자로 센다', async () => {
    const database = await freshDatabase();
    const setId = (await getActiveTimetableSet(database)).id;
    expect(MAX_MEMO_LENGTH).toBe(60);
    await createTimetableItem(database, item(setId, '한글 60자', '가'.repeat(60)));
    await createTimetableItem(database, item(setId, '이모지 60자', '🚌'.repeat(60)));
    await expect(createTimetableItem(database, item(setId, '61자', '가'.repeat(61)))).rejects.toThrow('memo');
    await expect(createTimetableItem(database, item(setId, '이모지 61자', '🚌'.repeat(61)))).rejects.toThrow('memo');
    expect(await getEditableTimetableItems(database, setId)).toHaveLength(2);
  });

  it('긴 메모로 수정하려 하면 거절하고 기존 메모를 지키며, 공백만 긴 경우는 통과한다', async () => {
    const database = await freshDatabase();
    const setId = (await getActiveTimetableSet(database)).id;
    await createTimetableItem(database, item(setId, '피아노', '원래 메모'));
    const id = (await getEditableTimetableItems(database, setId))[0].id;
    await expect(updateTimetableItem(database, id, item(setId, '피아노', '가'.repeat(61)))).rejects.toThrow('memo');
    expect((await getEditableTimetableItemById(database, id))?.memo).toBe('원래 메모');
    await updateTimetableItem(database, id, item(setId, '피아노', ` ${' '.repeat(80)} 짧은 메모`));
    expect((await getEditableTimetableItemById(database, id))?.memo).toBe('짧은 메모');
  });

  it('여러 요일에 한 번에 추가해도 모두 같은 메모를 가진다', async () => {
    const database = await freshDatabase();
    const setId = (await getActiveTimetableSet(database)).id;
    const { weekday: _weekday, ...withoutWeekday } = item(setId, '수영', '수영복 챙기기');
    await createTimetableItems(database, [1, 3, 5], withoutWeekday);
    expect((await getEditableTimetableItems(database, setId)).map(({ memo }) => memo)).toEqual(['수영복 챙기기', '수영복 챙기기', '수영복 챙기기']);
  });
});

describe('복사에서 메모 유지', () => {
  it('요일 복사가 메모도 복사한다', async () => {
    const database = await freshDatabase();
    const setId = (await getActiveTimetableSet(database)).id;
    await createTimetableItem(database, item(setId, '피아노', '악보 가방', 1));
    await copyTimetableWeekday(database, 1, 2, setId);
    expect((await getEditableTimetableItems(database, setId)).map(({ weekday, memo }) => [weekday, memo])).toEqual([[1, '악보 가방'], [2, '악보 가방']]);
  });

  it('시간표 세트를 복제하면 메모도 복제되고 원본은 그대로다', async () => {
    const database = await freshDatabase();
    const setId = (await getActiveTimetableSet(database)).id;
    await createTimetableItem(database, item(setId, '피아노', '악보 가방'));
    const copy = await createTimetableSet(database, '방학', { copyFromSetId: setId });
    expect((await getEditableTimetableItems(database, copy))[0].memo).toBe('악보 가방');
    const copied = (await getEditableTimetableItems(database, copy))[0];
    await updateTimetableItem(database, copied.id, item(copy, '피아노', '방학 메모'));
    expect((await getEditableTimetableItems(database, setId))[0].memo).toBe('악보 가방');
  });
});
