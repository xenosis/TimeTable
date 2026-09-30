import { notifyWidgetChecksApplied, subscribeWidgetChecksApplied } from '../src/widgets/widgetChecksSignal';

describe('widgetChecksSignal', () => {
  it('구독한 쪽에 알리고 구독을 해제하면 더 알리지 않는다', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeWidgetChecksApplied(listener);
    notifyWidgetChecksApplied();
    unsubscribe();
    notifyWidgetChecksApplied();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('여러 구독자가 모두 받고, 하나가 오류를 던져도 나머지는 받는다', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = jest.fn(() => { throw new Error('boom'); });
    const healthy = jest.fn();
    const offBroken = subscribeWidgetChecksApplied(broken);
    const offHealthy = subscribeWidgetChecksApplied(healthy);
    notifyWidgetChecksApplied();
    offBroken(); offHealthy();
    warn.mockRestore();
    expect(broken).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
  });
});
