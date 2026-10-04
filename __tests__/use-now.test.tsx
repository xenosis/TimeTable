import { AppState } from 'react-native';
import { act, create } from 'react-test-renderer';

import { useNow } from '../src/hooks/useNow';

function Probe({ onRender }: { readonly onRender: (now: Date) => void }) {
  onRender(useNow());
  return null;
}

describe('useNow', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 4, 16, 9, 30)); });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it('매 분이 시작될 때마다 현재 시각을 다시 읽어 다시 그린다', () => {
    const seen: string[] = [];
    act(() => { create(<Probe onRender={(now) => seen.push(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`)} />); });
    expect(seen.at(-1)).toBe('16:09');
    act(() => { jest.advanceTimersByTime(31_000); }); // 16:10:01
    expect(seen.at(-1)).toBe('16:10');
    act(() => { jest.advanceTimersByTime(60_000); }); // 16:11:01
    expect(seen.at(-1)).toBe('16:11');
  });

  it('앱이 다시 앞으로 오면 즉시 갱신한다', () => {
    let listener: (state: string) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => { listener = handler as (state: string) => void; return { remove: jest.fn() }; });
    const seen: number[] = [];
    act(() => { create(<Probe onRender={(now) => seen.push(now.getMinutes())} />); });
    jest.setSystemTime(new Date(2026, 9, 4, 16, 40, 0));
    act(() => { listener('active'); });
    expect(seen.at(-1)).toBe(40);
  });

  it('화면이 사라지면 타이머와 앱 상태 리스너를 정리한다', () => {
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove }));
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<Probe onRender={() => undefined} />); });
    expect(jest.getTimerCount()).toBe(1);
    act(() => { tree.unmount(); });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
