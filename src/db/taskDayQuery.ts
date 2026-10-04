import type { TimetableDatabase } from './types';

/**
 * 그날(요일 weekday) 해야 하는 할 일이 하나라도 있는지. 반복 요일·특정 날짜·종료일을 모두 반영한다.
 * 할 일은 만든 날부터만 센다: 시작일을 과거로 정해 만들어도 만들기 전 날들에는 없던 것으로 본다.
 */
export async function hasTasksOn(database: Pick<TimetableDatabase, 'getFirstAsync'>, date: string, weekday: number): Promise<boolean> {
  const row = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM tasks WHERE family_id = ? AND (effective_until IS NULL OR effective_until >= ?) AND (task_date = ? OR (instr(',' || repeat_weekdays || ',', ',' || ? || ',') > 0 AND effective_from <= ?)) AND date(created_at, 'localtime') <= ?`,
    'local-family', date, date, String(weekday), date, date,
  );
  return (row?.count ?? 0) > 0;
}
