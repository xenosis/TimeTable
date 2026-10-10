import { realtimeTables, subscribeFamilyChanges } from '../src/sync/realtimeSync';

type Handler = () => void;
const mockOn = jest.fn();
const mockRemove = jest.fn();
const mockChannel = jest.fn();
let mockStatusCallback: (status: string) => void = () => undefined;
const mockHandlers: Handler[] = [];

jest.mock('../src/server/supabaseClient', () => ({
  getSupabase: () => {
    const channel = {
      on: (event: string, options: unknown, handler: Handler) => { mockOn(event, options); mockHandlers.push(handler); return channel; },
      subscribe: (callback: (status: string) => void) => { mockStatusCallback = callback; return channel; },
    };
    return { channel: (...args: unknown[]) => { mockChannel(...args); return channel; }, removeChannel: (target: unknown) => mockRemove(target) };
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
  expect(mockChannel).toHaveBeenCalledWith(expect.any(String), { config: { postgres_changes_options: { wait: true } } });
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

test('첫 조회와 구독 사이 변경을 보완하고, 오류 뒤 재연결에서도 한 번 맞춘다', () => {
  const onChange = jest.fn();
  subscribeFamilyChanges('fam-1', onChange);
  mockStatusCallback('SUBSCRIBED');
  jest.advanceTimersByTime(3000);
  expect(onChange).toHaveBeenCalledTimes(1);
  const before = mockOn.mock.calls.length;
  mockStatusCallback('CHANNEL_ERROR');
  mockStatusCallback('TIMED_OUT');
  jest.advanceTimersByTime(30000);
  // 채널을 지우거나 새로 만들지 않는다(남은 채널이 없으면 라이브러리가 소켓을 끊어 다시 이어지지 않음)
  expect(mockRemove).not.toHaveBeenCalled();
  expect(mockOn.mock.calls.length).toBe(before);
  mockStatusCallback('SUBSCRIBED');
  jest.advanceTimersByTime(2000);
  expect(onChange).toHaveBeenCalledTimes(2);
  // 끊김 없이 다시 SUBSCRIBED가 와도 더 맞추지 않는다
  mockStatusCallback('SUBSCRIBED');
  jest.advanceTimersByTime(5000);
  expect(onChange).toHaveBeenCalledTimes(2);
});

test('인터넷 없이 시작해 처음 연결 전에 오류가 났으면, 처음 이어질 때도 한 번 맞춘다(시작 동기화가 실패했을 수 있음)', () => {
  const onChange = jest.fn();
  subscribeFamilyChanges('fam-1', onChange);
  mockStatusCallback('TIMED_OUT');
  mockStatusCallback('SUBSCRIBED');
  jest.advanceTimersByTime(2000);
  expect(onChange).toHaveBeenCalledTimes(1);
});

test('채널이 완전히 닫히면 5초 뒤 새 채널로 다시 구독하고, 이어지면 한 번 맞춘다', () => {
  const onChange = jest.fn();
  subscribeFamilyChanges('fam-1', onChange);
  mockStatusCallback('SUBSCRIBED');
  mockStatusCallback('CLOSED');
  const before = mockOn.mock.calls.length;
  jest.advanceTimersByTime(4999);
  expect(mockOn.mock.calls.length).toBe(before);
  jest.advanceTimersByTime(1);
  expect(mockOn.mock.calls.length).toBe(before + realtimeTables.length);
  mockStatusCallback('SUBSCRIBED');
  jest.advanceTimersByTime(2000);
  expect(onChange).toHaveBeenCalledTimes(2);
});

test('신호가 2초보다 짧은 간격으로 계속 와도 첫 신호 뒤 5초 안에는 한 번 맞춘다', () => {
  const onChange = jest.fn();
  subscribeFamilyChanges('fam-1', onChange);
  for (let i = 0; i < 6; i += 1) { mockHandlers[0](); jest.advanceTimersByTime(1000); }
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
