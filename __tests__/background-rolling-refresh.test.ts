const mockBackgroundTask = {
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Available: 2, Restricted: 1 },
  getStatusAsync: jest.fn(),
  registerTaskAsync: jest.fn(),
};
const mockTaskManager = {
  defineTask: jest.fn(),
  isTaskDefined: jest.fn(),
  isAvailableAsync: jest.fn(),
  isTaskRegisteredAsync: jest.fn(),
};
const mockRefreshAllRollingOwners = jest.fn();

jest.mock('expo-background-task', () => mockBackgroundTask);
jest.mock('expo-task-manager', () => mockTaskManager);
jest.mock('../src/notifications/rollingOwners', () => ({ refreshAllRollingOwners: mockRefreshAllRollingOwners }));

describe('background rolling refresh', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockTaskManager.isTaskDefined.mockReturnValue(false);
    mockTaskManager.isAvailableAsync.mockResolvedValue(true);
    mockBackgroundTask.getStatusAsync.mockResolvedValue(mockBackgroundTask.BackgroundTaskStatus.Available);
    mockTaskManager.isTaskRegisteredAsync.mockResolvedValue(false);
  });

  const load = () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../src/notifications/backgroundRollingRefresh') as typeof import('../src/notifications/backgroundRollingRefresh');
  };

  it('defines a global task that refreshes notifications and reports success', async () => {
    load();
    const executor = mockTaskManager.defineTask.mock.calls[0][1] as () => Promise<number>;

    await expect(executor()).resolves.toBe(mockBackgroundTask.BackgroundTaskResult.Success);
    expect(mockRefreshAllRollingOwners).toHaveBeenCalledTimes(1);
  });

  it('reports failure when the background refresh fails', async () => {
    mockRefreshAllRollingOwners.mockRejectedValueOnce(new Error('database unavailable'));
    load();
    const executor = mockTaskManager.defineTask.mock.calls[0][1] as () => Promise<number>;

    await expect(executor()).resolves.toBe(mockBackgroundTask.BackgroundTaskResult.Failed);
  });

  it('registers the task at Android minimum interval only once', async () => {
    const { registerRollingRefreshBackgroundTask, ROLLING_REFRESH_BACKGROUND_TASK } = load();

    await expect(registerRollingRefreshBackgroundTask()).resolves.toBe('registered');
    expect(mockBackgroundTask.registerTaskAsync).toHaveBeenCalledWith(ROLLING_REFRESH_BACKGROUND_TASK, { minimumInterval: 15 });

    mockTaskManager.isTaskRegisteredAsync.mockResolvedValueOnce(true);
    await expect(registerRollingRefreshBackgroundTask()).resolves.toBe('already-registered');
  });

  it('does not register when the platform restricts background tasks', async () => {
    mockBackgroundTask.getStatusAsync.mockResolvedValueOnce(mockBackgroundTask.BackgroundTaskStatus.Restricted);
    const { registerRollingRefreshBackgroundTask } = load();

    await expect(registerRollingRefreshBackgroundTask()).resolves.toBe('unavailable');
    expect(mockBackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
  });
});
