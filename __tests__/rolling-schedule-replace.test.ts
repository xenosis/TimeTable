import { replaceRollingNotificationsFromDatabase } from '../src/notifications/taskRollingSchedule';
import { replaceTimetableRollingNotificationsFromDatabase } from '../src/notifications/rollingSchedule';

jest.mock('../src/notifications/secureAlarmPoc', () => ({ replaceAndroidRollingSchedule: jest.fn().mockResolvedValue(1) }));

describe('replaceRollingNotificationsFromDatabase', () => {
  it('lets the P3.4 timetable boundary replace a complete timetable generation by itself', async () => {
    const { replaceAndroidRollingSchedule } = jest.requireMock('../src/notifications/secureAlarmPoc') as { replaceAndroidRollingSchedule: jest.Mock };
    const database = { getAllAsync: jest.fn().mockResolvedValueOnce([{ id: 1, weekday: 1, startTime: '09:00', title: '국어', category: 'school', alertMode: 'notify', alertBeforeMin: 0 }]).mockResolvedValueOnce([]) };

    await expect(replaceTimetableRollingNotificationsFromDatabase(database, new Date(2026, 8, 14, 8, 0))).resolves.toBe(1);

    expect(replaceAndroidRollingSchedule).toHaveBeenLastCalledWith([{ id: '1:2026-09-14', title: '국어', triggerAt: new Date(2026, 8, 14, 9, 0).getTime(), mode: 'notify' }], 'timetable');
  });

  it('sends only future rolling entries to the native replacement boundary', async () => {
    const { replaceAndroidRollingSchedule } = jest.requireMock('../src/notifications/secureAlarmPoc') as { replaceAndroidRollingSchedule: jest.Mock };
    const database = { getAllAsync: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]) };
    await expect(replaceRollingNotificationsFromDatabase(database, new Date(2026, 8, 14, 8, 0))).resolves.toBe(1);
    expect(replaceAndroidRollingSchedule).toHaveBeenCalledWith([], 'tasks');
  });

  it('replaces the tasks owner with first and 30-minute repeat reminders, omitting completed tasks', async () => {
    const { replaceAndroidRollingSchedule } = jest.requireMock('../src/notifications/secureAlarmPoc') as { replaceAndroidRollingSchedule: jest.Mock };
    const database = { getAllAsync: jest.fn()
      .mockResolvedValueOnce([
        { id: 5, title: '숙제', repeatWeekdays: '1', taskDate: null, effectiveFrom: '2026-09-01', remindTime: '19:00', alertMode: 'notify' },
        { id: 6, title: '독서', repeatWeekdays: '1', taskDate: null, effectiveFrom: '2026-09-01', remindTime: '19:00', alertMode: 'alarm' },
      ])
      .mockResolvedValueOnce([{ taskId: 6, completionDate: '2026-09-14' }]) };
    await replaceRollingNotificationsFromDatabase(database, new Date(2026, 8, 14, 18, 0));
    expect(replaceAndroidRollingSchedule).toHaveBeenLastCalledWith([
      { id: 'task:5:2026-09-14:first', title: '숙제', triggerAt: new Date(2026, 8, 14, 19, 0).getTime(), mode: 'notify' },
      { id: 'task:5:2026-09-14:repeat', title: '숙제', triggerAt: new Date(2026, 8, 14, 19, 30).getTime(), mode: 'notify' },
    ], 'tasks');
  });
});
