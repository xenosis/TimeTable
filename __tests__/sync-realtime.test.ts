import { realtimeTables, subscribeFamilyChanges } from '../src/sync/realtimeSync';

type Handler = () => void;
const mockOn = jest.fn();
const mockRemove = jest.fn();
let mockStatusCallback: (status: string) => void = () => undefined;
const mockHandlers: Handler[] = [];

jest.mock('../src/server/supabaseClient', () => ({
  getSupabase: () => {
    const channel = {
      on: (event: string, options: unknown, handler: Handler) => { mockOn(event, options); mockHandlers.push(handler); return channel; },
      subscribe: (callback: (status: string) => void) => { mockStatusCallback = callback; return channel; },
    };
    return { channel: () => channel, removeChannel: (target: unknown) => mockRemove(target) };
  },
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockHandlers.length = 0;
});
afterEach(() => jest.useRealTimers());

test('가족 데이터 테이블마다 이 가족만 거르는 구독을 건다(기기 기록 테이블은 듣지 않음)', () => {
  subscribeFamilyChanges('fam-1', jest.fn());
  expect(mockOn).toHaveBeenCalledTimes(realtimeTables.length);
  expect(mockOn).toHaveBeenCalledWith('postgres_changes', { event: '*', schema: 'public', table: 'tt_tasks', filter: 'family_id=eq.fam-1' });
  expect(realtimeTables).not.toContain('tt_devices');
});

test('연달아 온 변경은 2초 모아 한 번만 동기화한다', () => {
  const onChange = jest.fn();
  subscribeFamilyChanges('fam-1', onChange);
  mockHandlers[0](); mockHandlers[3](); mockHandlers[5]();
  jest.advanceTimersByTime(1999);
  expect(onChange).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(onChange).toHaveBeenCalledTimes(1);
});

test('처음 연결에는 동기화하지 않고(시작 동기화가 이미 돔), 다시 이어지면 놓친 변경을 받으려고 한 번 맞춘다', () => {
  const onChange = jest.fn();
  subscribeFamilyChanges('fam-1', onChange);
  mockStatusCallback('SUBSCRIBED');
  jest.advanceTimersByTime(3000);
  expect(onChange).not.toHaveBeenCalled();
  mockStatusCallback('CHANNEL_ERROR');
  mockStatusCallback('SUBSCRIBED');
  jest.advanceTimersByTime(2000);
  expect(onChange).toHaveBeenCalledTimes(1);
});

test('구독을 끝내면 채널을 지우고 대기 중인 동기화도 취소한다', () => {
  const onChange = jest.fn();
  const stop = subscribeFamilyChanges('fam-1', onChange);
  mockHandlers[0]();
  stop();
  jest.advanceTimersByTime(5000);
  expect(onChange).not.toHaveBeenCalled();
  expect(mockRemove).toHaveBeenCalledTimes(1);
});
