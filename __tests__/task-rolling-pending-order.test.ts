import { replaceAndroidRollingSchedule } from '../src/notifications/secureAlarmPoc';
import { replaceAfterPendingWidgetChecks } from '../src/notifications/taskRollingSchedule';

jest.mock('../src/notifications/secureAlarmPoc', () => ({ replaceAndroidRollingSchedule: jest.fn(async () => 0) }));

const task = { id: 7, title: '숙제', repeatWeekdays: '1', taskDate: null, effectiveFrom: '2026-10-01', effectiveUntil: null, remindTime: '21:00', alertMode: 'notify' };

/** 위젯 체크가 반영되면 완료 기록이 생기는 작은 DB 흉내. 읽은 순서도 남긴다. */
function fakeDatabase(order: string[]) {
  const completions: { taskId: number; completionDate: string }[] = [];
  const database = {
    completions,
    getAllAsync: jest.fn(async (sql: string) => {
      order.push('read');
      return (sql.includes('FROM tasks') ? [task] : completions) as never;
    }),
  };
  return database;
}

describe('할 일 알림 예약 전 위젯 체크 반영', () => {
  const now = new Date(2026, 9, 5, 15, 0); // 월요일 15:00, 알림은 21:00

  it('위젯에서 끝낸 할 일은 먼저 반영돼 오늘 알림이 예약되지 않는다', async () => {
    const order: string[] = [];
    const database = fakeDatabase(order);
    const apply = jest.fn(async () => { order.push('apply'); database.completions.push({ taskId: 7, completionDate: '2026-10-05' }); return 1; });
    await replaceAfterPendingWidgetChecks(database, apply, now);
    expect(order[0]).toBe('apply');
    const scheduled = jest.mocked(replaceAndroidRollingSchedule).mock.calls.at(-1)![0];
    expect(scheduled.some(({ triggerAt }) => new Date(triggerAt).getDate() === 5)).toBe(false);
  });

  it('반영이 실패해도 예약은 계속한다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const database = fakeDatabase([]);
    await replaceAfterPendingWidgetChecks(database, jest.fn(async () => { throw new Error('busy'); }), now);
    const scheduled = jest.mocked(replaceAndroidRollingSchedule).mock.calls.at(-1)![0];
    expect(scheduled.some(({ triggerAt }) => new Date(triggerAt).getDate() === 5)).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
