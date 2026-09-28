import { buildTaskRollingNotifications } from '../src/utils/taskRollingNotifications';

describe('task rolling notifications', () => {
  it('adds a reminder and retry only for an incomplete applicable task', () => {
    const now = new Date(2026, 8, 14, 18, 0);
    const tasks = [{ id: 1, title: '숙제', repeatWeekdays: '1', taskDate: null, effectiveFrom: '2026-09-01', remindTime: '19:00', alertMode: 'notify' as const }];
    expect(buildTaskRollingNotifications(tasks, new Set(), now, 1).map(({ id }) => id)).toEqual(['task:1:2026-09-14:first', 'task:1:2026-09-14:repeat']);
    expect(buildTaskRollingNotifications(tasks, new Set(['1:2026-09-14']), now, 1)).toEqual([]);
  });

  it('does not include a retry that falls outside the rolling window', () => {
    const now = new Date(2026, 8, 14, 0, 0);
    const task = [{ id: 2, title: '정리', repeatWeekdays: '0', taskDate: null, effectiveFrom: '2026-09-01', remindTime: '23:50', alertMode: 'notify' as const }];
    expect(buildTaskRollingNotifications(task, new Set(), now, 7).every(({ triggerAt }) => triggerAt.getTime() < now.getTime() + 7 * 24 * 60 * 60 * 1000)).toBe(true);
  });
});
