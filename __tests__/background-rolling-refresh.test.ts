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
const mockRefreshSchool = jest.fn(async () => null);
const mockBackgroundSync = jest.fn();

jest.mock('expo-background-task', () => mockBackgroundTask);
jest.mock('expo-task-manager', () => mockTaskManager);
jest.mock('../src/notifications/rollingOwners', () => ({ refreshAllRollingOwners: mockRefreshAllRollingOwners }));
jest.mock('../src/neis/schoolAutoRefresh', () => ({ refreshSchoolTimetableIfDue: mockRefreshSchool }));
jest.mock('../src/sync/backgroundSync', () => ({ syncFamilyInBackground: mockBackgroundSync }));

describe('background rolling refresh', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockRefreshAllRollingOwners.mockReset().mockResolvedValue(undefined);
    mockBackgroundSync.mockResolvedValue(true);
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
    expect(mockRefreshAllRollingOwners).toHaveBeenCalledTimes(2);
    expect(mockRefreshSchool).toHaveBeenCalledTimes(1);
  });

  it('keeps refreshing notifications when the school timetable check fails', async () => {
    mockRefreshSchool.mockRejectedValueOnce(new Error('neis down'));
    load();
    const executor = mockTaskManager.defineTask.mock.calls[0][1] as () => Promise<number>;

    await expect(executor()).resolves.toBe(mockBackgroundTask.BackgroundTaskResult.Success);
    expect(mockRefreshAllRollingOwners).toHaveBeenCalledTimes(2);
  });

  it('reports failure when the background refresh fails', async () => {
    mockRefreshAllRollingOwners.mockRejectedValueOnce(new Error('database unavailable'));
    load();
    const executor = mockTaskManager.defineTask.mock.calls[0][1] as () => Promise<number>;

    await expect(executor()).resolves.toBe(mockBackgroundTask.BackgroundTaskResult.Failed);
    expect(mockBackgroundSync).toHaveBeenCalledTimes(1);
    expect(mockRefreshAllRollingOwners).toHaveBeenCalledTimes(2);
  });

  it('서버 동기화 실패에도 로컬 예약을 갱신하고 OS에 실패를 알린다', async () => {
    mockBackgroundSync.mockRejectedValueOnce(new Error('offline'));
    load();
    const executor = mockTaskManager.defineTask.mock.calls[0][1] as () => Promise<number>;
    await expect(executor()).resolves.toBe(mockBackgroundTask.BackgroundTaskResult.Failed);
    expect(mockRefreshAllRollingOwners).toHaveBeenCalledTimes(2);
    expect(mockRefreshAllRollingOwners.mock.invocationCallOrder[0]).toBeLessThan(mockBackgroundSync.mock.invocationCallOrder[0]);
  });

  it('서버 요청이 끝나지 않아도 기존 로컬 예약을 먼저 갱신한다', async () => {
    let started!: () => void;
    const serverStarted = new Promise<void>((resolve) => { started = resolve; });
    mockBackgroundSync.mockImplementationOnce(() => { started(); return new Promise(() => undefined); });
    load();
    const executor = mockTaskManager.defineTask.mock.calls[0][1] as () => Promise<number>;
    void executor();
    await serverStarted;
    expect(mockRefreshAllRollingOwners).toHaveBeenCalledTimes(1);
    expect(mockBackgroundSync).toHaveBeenCalledTimes(1);
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
