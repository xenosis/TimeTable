import { buildNotificationsFromDatabase } from '../src/notifications/rollingSchedule';

describe('buildNotificationsFromDatabase', () => {
  it('passes registered holiday ranges to school-alert calculation, including an event after the window with an earlier lead', async () => {
    const calls: unknown[][] = [];
    const database = { getAllAsync: async <T,>(...args: unknown[]) => { calls.push(args); return [{ startDate: '2026-09-14', endDate: '2026-09-14' }, { startDate: '2026-09-22', endDate: '2026-09-22' }] as unknown as T[]; } };
    const items = [
      { id: 1, weekday: 1, startTime: '09:00', title: 'School', category: 'school' as const, alertMode: 'notify' as const, alertBeforeMin: 0 },
      { id: 2, weekday: 1, startTime: '10:00', title: 'Academy', category: 'academy' as const, alertMode: 'notify' as const, alertBeforeMin: 0 },
      { id: 3, weekday: 2, startTime: '00:15', title: 'Late holiday', category: 'school' as const, alertMode: 'notify' as const, alertBeforeMin: 300 },
    ];
    const notifications = await buildNotificationsFromDatabase(database, items, new Date(2026, 8, 14, 20, 0));
    expect(notifications.map(({ itemId }) => itemId)).toEqual([1, 2]);
    expect(notifications).not.toEqual(expect.arrayContaining([expect.objectContaining({ itemId: 3 })]));
    expect(calls[0]).toEqual([expect.any(String), 'local-family', '2026-09-22', '2026-09-14']);
  });
});
