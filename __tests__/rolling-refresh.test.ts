import { createCoalescedRefresh } from '../src/utils/coalescedRefresh';

describe('createCoalescedRefresh', () => {
  it('runs once more when a refresh request arrives during an active refresh', async () => {
    let release: (() => void) | undefined;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const refresh = jest.fn(async () => { if (refresh.mock.calls.length === 1) await wait; });
    const request = createCoalescedRefresh(refresh);

    const first = request();
    const second = request();
    release?.();
    await Promise.all([first, second]);

    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
