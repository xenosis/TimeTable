import { createReadTimedFetch } from '../src/server/requestTimeout';
import { createClient } from '@supabase/supabase-js';

beforeEach(() => { jest.useFakeTimers(); jest.spyOn(console, 'info').mockImplementation(() => undefined); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('시간 제한은 실제 요청을 취소하고 요청 종료 뒤에 실패한다', async () => {
  let requestSignal: AbortSignal | undefined;
  const fetcher = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    requestSignal = init?.signal ?? undefined;
    requestSignal?.addEventListener('abort', () => reject(new Error('aborted')));
  })) as jest.MockedFunction<typeof fetch>;
  const request = createReadTimedFetch(fetcher, 100)('https://example.test/rest/v1/tt_tasks');
  const failure = expect(request).rejects.toThrow('Network request timed out');
  jest.advanceTimersByTime(100);
  expect(requestSignal?.aborted).toBe(true);
  await failure;
  expect(jest.getTimerCount()).toBe(0);
});

test('호출자 취소를 실제 요청에 전달하고 시간 제한 오류로 바꾸지 않는다', async () => {
  const caller = new AbortController();
  const fetcher = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('caller cancelled')));
  })) as jest.MockedFunction<typeof fetch>;
  const request = createReadTimedFetch(fetcher)('https://example.test/rest/v1/tt_tasks', { signal: caller.signal });
  const failure = expect(request).rejects.toThrow('caller cancelled');
  caller.abort();
  await failure;
  expect(jest.getTimerCount()).toBe(0);
});

test('정상 응답을 보존하고 인증 정보나 쿼리를 로그에 남기지 않는다', async () => {
  const response = { ok: true } as Response;
  const fetcher = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response) as jest.MockedFunction<typeof fetch>;
  await expect(createReadTimedFetch(fetcher)('https://example.test/rest/v1/tt_tasks?family_id=secret', { headers: { Authorization: 'private' } })).resolves.toBe(response);
  expect(jest.getTimerCount()).toBe(0);
  const logs = JSON.stringify((console.info as jest.Mock).mock.calls);
  expect(logs).not.toContain('secret');
  expect(logs).not.toContain('private');
});

test('실제 SDK의 재시도 옵션이 켜져도 취소된 GET은 반복하지 않는다', async () => {
  const fetcher = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  })) as jest.MockedFunction<typeof fetch>;
  const client = createClient('https://example.test', 'test-key', {
    accessToken: async () => 'test-only', db: { retry: true }, global: { fetch: createReadTimedFetch(fetcher, 100) },
  });
  const request = client.from('tt_tasks').select('*').then((result) => result);
  await jest.advanceTimersByTimeAsync(100);
  const result = await request;
  expect(result.error?.message).toContain('Network request timed out');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('실제 SDK의 자동 재시도를 끄면 통신 실패 뒤 다음 요청을 실행할 수 있다', async () => {
  const response = { ok: true, status: 200, statusText: 'OK', headers: new Headers(), text: async () => '[]' } as Response;
  const fetcher = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response)
    .mockRejectedValueOnce(new Error('Network request failed'));
  const client = createClient('https://example.test', 'test-key', {
    accessToken: async () => 'test-only', db: { retry: false }, global: { fetch: createReadTimedFetch(fetcher) },
  });
  expect((await client.from('tt_tasks').select('*')).error).not.toBeNull();
  expect((await client.from('tt_tasks').select('*')).data).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});

test('실제 SDK 저장이 끝난 뒤 응답만 지연돼도 쓰기 요청을 임의로 취소하지 않는다', async () => {
  let saved = false;
  let signal: AbortSignal | null | undefined;
  let finish!: (response: Response) => void;
  const fetcher = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    saved = true;
    signal = init?.signal;
    return new Promise<Response>((resolve) => { finish = resolve; });
  });
  const client = createClient('https://example.test', 'test-key', {
    accessToken: async () => 'test-only', db: { retry: false }, global: { fetch: createReadTimedFetch(fetcher, 100) },
  });
  const request = client.rpc('tt_apply_family_edit', {}).then((result) => result);
  await jest.advanceTimersByTimeAsync(1000);
  expect(saved).toBe(true);
  expect(signal?.aborted).toBe(false);
  finish({ ok: true, status: 200, statusText: 'OK', headers: new Headers(), text: async () => '{"saved":true}' } as Response);
  expect((await request).data).toEqual({ saved: true });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
