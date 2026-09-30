import { buildTaskRollingNotifications } from '../src/utils/taskRollingNotifications';

describe('task rolling notifications', () => {
  it('adds a reminder and retry only for an incomplete applicable task', () => {
    const now = new Date(2026, 8, 14, 18, 0);
    const tasks = [{ id: 1, title: '숙제', repeatWeekdays: '1', taskDate: null, effectiveFrom: '2026-09-01', remindTime: '19:00', alertMode: 'notify' as const }];
    expect(buildTaskRollingNotifications(tasks, new Set(), now, 1).map(({ id }) => id)).toEqual(['task:1:2026-09-14:first', 'task:1:2026-09-14:repeat']);
    expect(buildTaskRollingNotifications(tasks, new Set(['1:2026-09-14']), now, 1)).toEqual([]);
  });

  it('stops reminding the day after a recurring task is ended, but keeps the end date itself', () => {
    const now = new Date(2026, 9, 1, 6, 0); // 2026-10-01(목) 06:00
    const everyDay = '0,1,2,3,4,5,6';
    const ended = [{ id: 3, title: '학원 숙제', repeatWeekdays: everyDay, taskDate: null, effectiveFrom: '2026-09-01', effectiveUntil: '2026-10-02', remindTime: '07:30', alertMode: 'alarm' as const }];
    const dates = buildTaskRollingNotifications(ended, new Set(), now, 7).map(({ id }) => id.split(':')[2]);
    expect([...new Set(dates)]).toEqual(['2026-10-01', '2026-10-02']);
    // 종료일이 없는 같은 할 일은 7일 내내 이어진다
    const open = [{ ...ended[0], effectiveUntil: null }];
    expect(new Set(buildTaskRollingNotifications(open, new Set(), now, 7).map(({ id }) => id.split(':')[2])).size).toBe(7);
  });

  it('applies the end date to one-off tasks the same way', () => {
    const now = new Date(2026, 9, 1, 6, 0);
    const oneOff = [{ id: 5, title: '단발', repeatWeekdays: null, taskDate: '2026-10-03', effectiveFrom: null, effectiveUntil: '2026-10-02', remindTime: '07:30', alertMode: 'notify' as const }];
    expect(buildTaskRollingNotifications(oneOff, new Set(), now, 7)).toEqual([]);
  });

  it('does not include a retry that falls outside the rolling window', () => {
    const now = new Date(2026, 8, 14, 0, 0);
    const task = [{ id: 2, title: '정리', repeatWeekdays: '0', taskDate: null, effectiveFrom: '2026-09-01', remindTime: '23:50', alertMode: 'notify' as const }];
    expect(buildTaskRollingNotifications(task, new Set(), now, 7).every(({ triggerAt }) => triggerAt.getTime() < now.getTime() + 7 * 24 * 60 * 60 * 1000)).toBe(true);
  });
});
