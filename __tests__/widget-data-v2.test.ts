/** @jest-environment node */
import { migrateDatabase } from '../src/db/migrations';
import { createTask, endRecurringTask, setTaskCompleted } from '../src/db/taskRepository';
import { createTimetableItem } from '../src/db/timetableRepository';
import { createTimetableSet, getActiveTimetableSet, setActiveTimetableSet } from '../src/db/timetableSetRepository';
import type { TimetableItemInput } from '../src/db/types';
import { defaultTheme as daylightTheme, themes } from '../src/theme';
import { buildWidgetData, WIDGET_DAYS, WIDGET_MAX_BYTES } from '../src/widgets/widgetDataV2';
import { openTestDatabase } from '../test-utils/sqliteTestDatabase';

// 2026-09-30은 수요일이다. 오늘부터 7일은 수·목·금·토·일·월·화(10-06)이다.
const WEDNESDAY = new Date(2026, 8, 30, 8, 0);
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

const item = (setId: number, title: string, weekday: number, start = '09:00', end = '10:00', category: TimetableItemInput['category'] = 'academy'): TimetableItemInput => ({
  weekday, startTime: start, endTime: end, title, category, colorKey: 'math', iconKey: 'number', setId,
});

async function freshDatabase() {
  const database = openTestDatabase();
  await migrateDatabase(database);
  return database;
}

async function taskId(database: Awaited<ReturnType<typeof freshDatabase>>, title: string): Promise<number> {
  return (await database.getFirstAsync<{ id: number }>('SELECT id FROM tasks WHERE title = ?', title))!.id;
}

describe('buildWidgetData: 위젯 v2 데이터', () => {
  it('오늘부터 7일치를 날짜와 요일 순서대로 만든다', async () => {
    const database = await freshDatabase();
    const data = await buildWidgetData(database, daylightTheme, WEDNESDAY);
    expect(data.schemaVersion).toBe(2);
    expect(data.days).toHaveLength(WIDGET_DAYS);
    expect(data.days.map(({ date }) => date)).toEqual(['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']);
    expect(data.days.map(({ weekday }) => weekday)).toEqual([3, 4, 5, 6, 0, 1, 2]);
    expect(data.timetableName).toBe('평소');
  });

  it('적용 중인 시간표의 일정만 그 요일에 담고, 시간표를 바꾸면 내용도 바뀐다', async () => {
    const database = await freshDatabase();
    const regular = (await getActiveTimetableSet(database)).id;
    const summer = await createTimetableSet(database, '여름방학');
    await createTimetableItem(database, item(regular, '수업', 3, '09:00', '13:00'));
    await createTimetableItem(database, item(regular, '피아노', 5, '17:00', '18:00'));
    await createTimetableItem(database, item(summer, '돌봄', 3, '10:00', '16:00'));
    const before = await buildWidgetData(database, daylightTheme, WEDNESDAY);
    expect(before.days[0].schedule.map(({ title }) => title)).toEqual(['수업']);
    expect(before.days[2].schedule.map(({ title }) => title)).toEqual(['피아노']);
    expect(before.days[3].schedule).toEqual([]);
    await setActiveTimetableSet(database, summer);
    const after = await buildWidgetData(database, daylightTheme, WEDNESDAY);
    expect(after.timetableName).toBe('여름방학');
    expect(after.days[0].schedule.map(({ title }) => title)).toEqual(['돌봄']);
    expect(after.days[2].schedule).toEqual([]);
  });

  it('쉬는 날(공휴일)에는 그날 학교·학원 일정을 비우고 다음 주 같은 요일은 그대로 보인다(P8.8)', async () => {
    const database = await freshDatabase();
    const regular = (await getActiveTimetableSet(database)).id;
    await createTimetableItem(database, item(regular, '수업', 5, '09:00', '13:00', 'school'));
    await createTimetableItem(database, item(regular, '피아노', 5, '17:00', '18:00'));
    await database.runAsync("INSERT INTO day_exceptions (start_date, end_date, type, note) VALUES ('2026-10-02', '2026-10-02', 'holiday', '나이스: 개교기념일')");
    const data = await buildWidgetData(database, daylightTheme, WEDNESDAY);
    expect(data.days[2]).toMatchObject({ date: '2026-10-02', schedule: [], hasSchool: false });
    const nextWeek = await buildWidgetData(database, daylightTheme, new Date(2026, 9, 7, 8, 0));
    expect(nextWeek.days.find((day) => day.date === '2026-10-09')?.schedule.map(({ title }) => title)).toEqual(['피아노']);
  });

  it('일정에 대비가 보장된 과목 색을 담는다', async () => {
    const database = await freshDatabase();
    const regular = (await getActiveTimetableSet(database)).id;
    await createTimetableItem(database, item(regular, '수학', 3));
    const [entry] = (await buildWidgetData(database, daylightTheme, WEDNESDAY)).days[0].schedule;
    const math = daylightTheme.categories.find((category) => category.key === 'math')!;
    expect(entry).toMatchObject({ startTime: '09:00', endTime: '10:00', backgroundColor: math.backgroundColor, textColor: math.textColor });
  });

  it('지원하는 모든 테마에서 위젯 색은 그 테마의 화면 색이고, 과목 색은 그 테마의 같은 의미 색이다(P7.5)', async () => {
    const database = await freshDatabase();
    const regular = (await getActiveTimetableSet(database)).id;
    await createTimetableItem(database, item(regular, '수학', 3));
    expect(themes.length).toBeGreaterThanOrEqual(2);
    for (const theme of themes) {
      const data = await buildWidgetData(database, theme, WEDNESDAY);
      const { background, surface, text, textMuted, primary, onPrimary, border } = theme.colors;
      expect(data.theme).toEqual({ background, surface, text, textMuted, primary, onPrimary, border });
      const math = theme.categories.find((category) => category.key === 'math')!;
      expect(data.days[0].schedule[0]).toMatchObject({ backgroundColor: math.backgroundColor, textColor: math.textColor });
    }
  });

  it('할 일: 반복 요일·특정 날짜·종료일·완료 여부를 날짜별로 반영한다', async () => {
    const database = await freshDatabase();
    await createTask(database, { title: '수요일 숙제', repeatWeekdays: [3], taskDate: '', effectiveFrom: '2026-09-01' });
    await createTask(database, { title: '월요일 준비물', repeatWeekdays: [1], taskDate: '', effectiveFrom: '2026-09-01' });
    await createTask(database, { title: '금요일 하루만', repeatWeekdays: [], taskDate: '2026-10-02', effectiveFrom: '' });
    await createTask(database, { title: '끝난 반복', repeatWeekdays: [4], taskDate: '', effectiveFrom: '2026-09-01' });
    await endRecurringTask(database, await taskId(database, '끝난 반복'), '2026-09-30'); // 오늘까지만 남고 목요일(10-01)부터는 빠진다
    await setTaskCompleted(database, await taskId(database, '수요일 숙제'), '2026-09-30', true);

    const { days } = await buildWidgetData(database, daylightTheme, WEDNESDAY);
    const titles = (index: number) => days[index].tasks.map(({ title }) => title);
    expect(titles(0)).toEqual(['수요일 숙제']);
    expect(days[0].tasks[0].completed).toBe(true);
    expect(titles(1)).toEqual([]);
    expect(titles(2)).toEqual(['금요일 하루만']);
    expect(days[2].tasks[0].completed).toBe(false);
    expect(titles(5)).toEqual(['월요일 준비물']);
    expect(titles(6)).toEqual([]);
  });

  it('할 일이 하나도 없으면 모든 날짜의 할 일이 비어 있고 숨긴 개수도 0이다', async () => {
    const database = await freshDatabase();
    const { days } = await buildWidgetData(database, daylightTheme, WEDNESDAY);
    for (const day of days) expect(day).toMatchObject({ tasks: [], schedule: [], hiddenScheduleCount: 0, hiddenTaskCount: 0 });
  });

  it('일요일(0)과 토요일(6)의 일정·할 일이 올바른 날짜 칸에 들어간다', async () => {
    const database = await freshDatabase();
    const regular = (await getActiveTimetableSet(database)).id;
    await createTimetableItem(database, item(regular, '토요일 수영', 6, '10:00', '11:00'));
    await createTimetableItem(database, item(regular, '일요일 교회', 0, '11:00', '12:00'));
    await createTask(database, { title: '일요일 청소', repeatWeekdays: [0], taskDate: '', effectiveFrom: '2026-09-01' });
    const { days } = await buildWidgetData(database, daylightTheme, WEDNESDAY);
    expect(days[3]).toMatchObject({ date: '2026-10-03', weekday: 6 });
    expect(days[3].schedule.map(({ title }) => title)).toEqual(['토요일 수영']);
    expect(days[3].tasks).toEqual([]);
    expect(days[4]).toMatchObject({ date: '2026-10-04', weekday: 0 });
    expect(days[4].schedule.map(({ title }) => title)).toEqual(['일요일 교회']);
    expect(days[4].tasks.map(({ title }) => title)).toEqual(['일요일 청소']);
  });

  it('오늘 완료한 매일 반복 할 일은 오늘만 완료로 나오고 다른 날짜로 새지 않는다', async () => {
    const database = await freshDatabase();
    await createTask(database, { title: '매일 독서', repeatWeekdays: EVERY_DAY, taskDate: '', effectiveFrom: '2026-09-01' });
    const id = await taskId(database, '매일 독서');
    await setTaskCompleted(database, id, '2026-09-30', true);
    await setTaskCompleted(database, id, '2026-10-02', true); // 미래 날짜의 기록은 그 날짜에만 반영된다
    const { days } = await buildWidgetData(database, daylightTheme, WEDNESDAY);
    expect(days.map((day) => day.tasks[0].completed)).toEqual([true, false, true, false, false, false, false]);
  });

  it('반복 할 일의 시작일·종료일은 당일을 포함하고, 그 밖의 날짜는 제외한다', async () => {
    const database = await freshDatabase();
    await createTask(database, { title: '10-03부터 매일', repeatWeekdays: EVERY_DAY, taskDate: '', effectiveFrom: '2026-10-03' });
    await createTask(database, { title: '10-01까지 매일', repeatWeekdays: EVERY_DAY, taskDate: '', effectiveFrom: '2026-09-01' });
    await endRecurringTask(database, await taskId(database, '10-01까지 매일'), '2026-10-01');
    const { days } = await buildWidgetData(database, daylightTheme, WEDNESDAY);
    const has = (index: number, title: string) => days[index].tasks.some((task) => task.title === title);
    expect([0, 1, 2].map((index) => has(index, '10-03부터 매일'))).toEqual([false, false, false]); // 09-30, 10-01, 10-02
    expect([3, 4, 5, 6].map((index) => has(index, '10-03부터 매일'))).toEqual([true, true, true, true]); // 시작일 당일부터
    expect([0, 1].map((index) => has(index, '10-01까지 매일'))).toEqual([true, true]); // 종료일 당일(10-01)까지 보인다
    expect([2, 3, 4, 5, 6].map((index) => has(index, '10-01까지 매일'))).toEqual([false, false, false, false, false]);
  });

  it('특정 날짜 할 일은 7일 창 안의 그날에만 나오고, 창 밖(어제·8일째)은 나오지 않는다', async () => {
    const database = await freshDatabase();
    for (const [title, taskDate] of [['어제', '2026-09-29'], ['오늘', '2026-09-30'], ['마지막날', '2026-10-06'], ['8일째', '2026-10-07']]) {
      await createTask(database, { title, repeatWeekdays: [], taskDate, effectiveFrom: '' });
    }
    const { days } = await buildWidgetData(database, daylightTheme, WEDNESDAY);
    const all = days.flatMap((day) => day.tasks.map((task) => `${day.date}:${task.title}`));
    expect(all).toEqual(['2026-09-30:오늘', '2026-10-06:마지막날']);
  });

  it('최악의 경우(모든 요일에 긴 일정·할 일이 가득)에도 하루 상한이 적용되고 64KB 안에 들어간다', async () => {
    const database = await freshDatabase();
    const regular = (await getActiveTimetableSet(database)).id;
    for (const weekday of EVERY_DAY) {
      for (let index = 0; index < 30; index += 1) {
        const start = `${String(8 + Math.floor(index / 6)).padStart(2, '0')}:${String((index % 6) * 10).padStart(2, '0')}`;
        await createTimetableItem(database, item(regular, `가${'가'.repeat(70)}${index}`, weekday, start, '23:59'));
      }
    }
    for (let index = 0; index < 20; index += 1) {
      await createTask(database, { title: `나${'나'.repeat(70)}${index}`, repeatWeekdays: EVERY_DAY, taskDate: '', effectiveFrom: '2026-09-01' });
    }
    const data = await buildWidgetData(database, daylightTheme, WEDNESDAY);
    const bytes = new TextEncoder().encode(JSON.stringify(data)).length;
    expect(bytes).toBeLessThanOrEqual(WIDGET_MAX_BYTES);
    expect(bytes).toBeGreaterThan(40 * 1024); // 정말 큰 경우를 시험했는지 확인
    for (const day of data.days) {
      expect(day.schedule).toHaveLength(20);
      expect(day.tasks).toHaveLength(10);
      expect(day.schedule.every(({ title }) => Array.from(title).length <= 60)).toBe(true);
      expect(day.hiddenScheduleCount).toBe(10); // 30개 중 20개만 담고 나머지 10개는 개수로 알린다
      expect(day.hiddenTaskCount).toBe(10); // 20개 중 10개
    }
  });

  it('긴 제목을 자를 때 이모지를 반쪽으로 깨뜨리지 않는다', async () => {
    const database = await freshDatabase();
    const regular = (await getActiveTimetableSet(database)).id;
    await createTimetableItem(database, item(regular, `${'가'.repeat(58)}🎹🎹🎹`, 3));
    const [entry] = (await buildWidgetData(database, daylightTheme, WEDNESDAY)).days[0].schedule;
    expect(Array.from(entry.title)).toHaveLength(60);
    expect(entry.title).toBe(`${'가'.repeat(58)}🎹…`);
    // 짝 없는 서로게이트가 없으면 왕복 인코딩해도 글자가 그대로다
    expect(new TextDecoder().decode(new TextEncoder().encode(entry.title))).toBe(entry.title);
  });

  it('자정을 막 넘긴 시각에도 날짜와 요일이 서로 어긋나지 않는다', async () => {
    const database = await freshDatabase();
    const data = await buildWidgetData(database, daylightTheme, new Date(2026, 9, 1, 0, 5)); // 목요일 00:05
    expect(data.days[0]).toMatchObject({ date: '2026-10-01', weekday: 4 });
    expect(data.days[6]).toMatchObject({ date: '2026-10-07', weekday: 3 });
  });

  describe('정규 수업(학교) 제외', () => {
    it('학교 일정은 빼고 학원·생활 일정만 시간순으로 담는다', async () => {
      const database = await freshDatabase();
      const regular = (await getActiveTimetableSet(database)).id;
      await createTimetableItem(database, item(regular, '수업', 3, '09:00', '13:50', 'school'));
      await createTimetableItem(database, item(regular, '피아노', 3, '17:10', '18:10', 'academy'));
      await createTimetableItem(database, item(regular, '주산암산', 3, '13:50', '14:30', 'academy'));
      await createTimetableItem(database, item(regular, '돌봄', 3, '14:30', '16:00', 'life'));
      const { days } = await buildWidgetData(database, daylightTheme, WEDNESDAY);
      expect(days[0].schedule.map(({ title }) => title)).toEqual(['주산암산', '돌봄', '피아노']);
      expect(days[0].hiddenScheduleCount).toBe(0); // 학교 때문에 뺀 것은 '숨긴 개수'가 아니다
    });

    it('학교 일정만 있는 날은 일정이 비어 있다', async () => {
      const database = await freshDatabase();
      const regular = (await getActiveTimetableSet(database)).id;
      await createTimetableItem(database, item(regular, '1교시 국어', 3, '09:00', '09:40', 'school'));
      await createTimetableItem(database, item(regular, '2교시 수학', 3, '09:50', '10:30', 'school'));
      const { days } = await buildWidgetData(database, daylightTheme, WEDNESDAY);
      expect(days[0].schedule).toEqual([]);
      expect(days[0].hasSchool).toBe(true); // 위젯이 '오늘은 수업 뒤 일정이 없어요'와 '오늘 일정이 없어요'를 구분한다
    });

    it('hasSchool은 그날 학교 수업이 있는 날만 true이다', async () => {
      const database = await freshDatabase();
      const regular = (await getActiveTimetableSet(database)).id;
      await createTimetableItem(database, item(regular, '1교시 국어', 3, '09:00', '09:40', 'school'));
      await createTimetableItem(database, item(regular, '피아노', 4, '16:00', '17:00'));
      const { days } = await buildWidgetData(database, daylightTheme, WEDNESDAY);
      expect(days.map(({ hasSchool }) => hasSchool)).toEqual([true, false, false, false, false, false, false]);
    });

    it('방학 시간표(학교 항목이 없음)는 모든 항목이 담긴다', async () => {
      const database = await freshDatabase();
      const summer = await createTimetableSet(database, '여름방학');
      await createTimetableItem(database, item(summer, '돌봄', 3, '10:00', '16:00', 'life'));
      await createTimetableItem(database, item(summer, '피아노', 3, '16:10', '17:00', 'academy'));
      await setActiveTimetableSet(database, summer);
      const { days } = await buildWidgetData(database, daylightTheme, WEDNESDAY);
      expect(days[0].schedule.map(({ title }) => title)).toEqual(['돌봄', '피아노']);
    });

    it('상한을 넘겨 못 담은 개수는 학교 항목을 제외한 뒤에 센다', async () => {
      const database = await freshDatabase();
      const regular = (await getActiveTimetableSet(database)).id;
      for (let index = 0; index < 5; index += 1) await createTimetableItem(database, item(regular, `수업${index}`, 3, `0${index + 1}:00`, `0${index + 1}:30`, 'school'));
      for (let index = 0; index < 23; index += 1) await createTimetableItem(database, item(regular, `학원${index}`, 3, `${String(10 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`, `${String(10 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '59' : '29'}`, 'academy'));
      const { days } = await buildWidgetData(database, daylightTheme, WEDNESDAY);
      expect(days[0].schedule).toHaveLength(20);
      expect(days[0].hiddenScheduleCount).toBe(3); // 학원 23개 중 20개만 담고 3개는 숨김, 학교 5개는 세지 않는다
    });
  });
});
