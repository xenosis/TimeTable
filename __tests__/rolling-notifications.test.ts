import { buildRollingNotifications, type RollingScheduleItem } from '../src/utils/rollingNotifications';

const items: RollingScheduleItem[] = [
  { id: 1, weekday: 1, startTime: '09:00', title: 'School', category: 'school', alertMode: 'notify', alertBeforeMin: 10 },
  { id: 2, weekday: 1, startTime: '15:00', title: 'Academy', category: 'academy', alertMode: 'alarm', alertBeforeMin: 0 },
  { id: 3, weekday: 2, startTime: '10:00', title: 'No alert', category: 'school', alertMode: 'none', alertBeforeMin: 0 },
];

describe('buildRollingNotifications', () => {
  it('builds seven days of future notifications with lead times and modes', () => {
    const now = new Date(2026, 8, 14, 8, 0);
    const result = buildRollingNotifications(items, [], now);
    expect(result.map(({ id, mode }) => ({ id, mode }))).toEqual([{ id: '1:2026-09-14', mode: 'notify' }, { id: '2:2026-09-14', mode: 'alarm' }]);
    expect(result[0].triggerAt).toEqual(new Date(2026, 8, 14, 8, 50));
  });

  it('skips school alerts in holiday or vacation ranges but keeps non-school alerts', () => {
    const result = buildRollingNotifications(items, [{ startDate: '2026-09-14', endDate: '2026-09-14' }], new Date(2026, 8, 14, 8, 0));
    expect(result.map((notification) => notification.itemId)).toEqual([2]);
  });

  it('excludes past alerts and rejects an invalid day count', () => {
    expect(buildRollingNotifications(items, [], new Date(2026, 8, 14, 9, 0)).map((notification) => notification.itemId)).toEqual([2, 1]);
    expect(() => buildRollingNotifications(items, [], new Date(2026, 8, 14), 0)).toThrow('days must be a positive integer');
  });

  it('keeps a next-week early event when its lead time falls inside the seven-day window', () => {
    const earlyNextMonday: RollingScheduleItem = { id: 4, weekday: 1, startTime: '00:15', title: 'Early', category: 'academy', alertMode: 'notify', alertBeforeMin: 30 };
    const result = buildRollingNotifications([...items, earlyNextMonday], [], new Date(2026, 8, 14, 8, 0));
    expect(result.at(-1)).toMatchObject({ id: '4:2026-09-21', triggerAt: new Date(2026, 8, 20, 23, 45) });
  });
});
