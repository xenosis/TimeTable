import { createRollingRefreshLifecycle, refreshAllRollingOwners } from '../src/notifications/RollingRefreshLifecycle';

jest.mock('../src/notifications/backgroundRollingRefresh', () => ({
  registerRollingRefreshBackgroundTask: jest.fn(),
}));
jest.mock('../src/notifications/rollingRefresh', () => ({
  requestRollingScheduleRefresh: jest.fn(),
}));
jest.mock('../src/notifications/taskRollingSchedule', () => ({
  requestTaskRollingScheduleRefresh: jest.fn(),
}));

const { requestRollingScheduleRefresh } = jest.requireMock('../src/notifications/rollingRefresh') as {
  requestRollingScheduleRefresh: jest.Mock;
};
const { requestTaskRollingScheduleRefresh } = jest.requireMock('../src/notifications/taskRollingSchedule') as {
  requestTaskRollingScheduleRefresh: jest.Mock;
};

describe('rolling refresh lifecycle', () => {
  it('refreshes and registers from every app entry path', async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const register = jest.fn().mockResolvedValue('registered');
    const lifecycle = createRollingRefreshLifecycle(refresh, register, jest.fn());

    await lifecycle.run();
    await lifecycle.onAppStateChange('active');

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(register).toHaveBeenCalledTimes(2);
  });

  it('refreshes timetable and task owners together through refreshAllRollingOwners', async () => {
    requestRollingScheduleRefresh.mockResolvedValue(undefined);
    requestTaskRollingScheduleRefresh.mockResolvedValue(undefined);

    await refreshAllRollingOwners();

    expect(requestRollingScheduleRefresh).toHaveBeenCalledTimes(1);
    expect(requestTaskRollingScheduleRefresh).toHaveBeenCalledTimes(1);
    expect(requestTaskRollingScheduleRefresh.mock.invocationCallOrder[0]).toBeGreaterThan(
      requestRollingScheduleRefresh.mock.invocationCallOrder[0],
    );
  });

  it('still refreshes the task owner when the timetable owner refresh fails', async () => {
    requestRollingScheduleRefresh.mockRejectedValue(new Error('timetable permission denied'));
    requestTaskRollingScheduleRefresh.mockClear();
    requestTaskRollingScheduleRefresh.mockResolvedValue(undefined);

    await expect(refreshAllRollingOwners()).rejects.toThrow('timetable permission denied');

    expect(requestTaskRollingScheduleRefresh).toHaveBeenCalledTimes(1);
  });

  it('creates notification channels before registering or refreshing', async () => {
    const events: string[] = [];
    const lifecycle = createRollingRefreshLifecycle(
      async () => { events.push('refresh'); },
      async () => { events.push('register'); return 'registered'; },
      () => undefined,
      async () => { events.push('channels'); },
    );

    await lifecycle.run();

    expect(events[0]).toBe('channels');
    expect(events).toEqual(expect.arrayContaining(['refresh', 'register']));
  });

  it('does nothing while the app is inactive', async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const register = jest.fn().mockResolvedValue('registered');
    const lifecycle = createRollingRefreshLifecycle(refresh, register, jest.fn());

    await lifecycle.onAppStateChange('background');

    expect(refresh).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('records when the platform restricts background registration', async () => {
    const onUnavailable = jest.fn();
    const lifecycle = createRollingRefreshLifecycle(
      jest.fn().mockResolvedValue(undefined),
      jest.fn().mockResolvedValue('unavailable'),
      onUnavailable,
    );

    await lifecycle.run();

    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it('registers the background task even when the immediate refresh fails', async () => {
    const refresh = jest.fn().mockRejectedValue(new Error('temporary database failure'));
    const register = jest.fn().mockResolvedValue('registered');
    const lifecycle = createRollingRefreshLifecycle(refresh, register, jest.fn());

    await expect(lifecycle.run()).rejects.toThrow('temporary database failure');
    expect(register).toHaveBeenCalledTimes(1);
  });
});
