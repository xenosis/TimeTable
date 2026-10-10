/** 읽기 HTTP 요청만 실제로 취소한다. 저장 응답이 늦다는 이유로 저장 실패를 단정하지 않는다. */
export function createReadTimedFetch(fetcher: typeof fetch, timeoutMs = 15000): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const caller = init?.signal ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined);
    const cancel = () => controller.abort();
    let timedOut = false;
    const started = Date.now();
    const method = (init?.method ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase();
    const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname;
    // 헤더·쿼리·응답 내용은 기록하지 않는다. 서버 요청의 고정 경로와 소요 시간만 남긴다.
    const label = /^\/(rest\/v1\/(tt_[a-z_]+|rpc\/tt_[a-z_]+)|auth\/v1\/[a-z_]+)$/.test(path) ? path : '요청';
    const timer = ['GET', 'HEAD', 'OPTIONS'].includes(method)
      ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs) : null;
    if (caller?.aborted) cancel();
    else caller?.addEventListener('abort', cancel, { once: true });
    console.info(`채아시간표: 서버 요청 시작 ${label}`);
    try {
      return await fetcher(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (timedOut) {
        const timeout = new Error('Network request timed out');
        timeout.name = 'AbortError'; // SDK가 취소된 GET을 자동 재시도하지 않게 식별자를 보존한다.
        throw timeout;
      }
      throw error;
    } finally {
      if (timer !== null) clearTimeout(timer);
      caller?.removeEventListener('abort', cancel);
      console.info(`채아시간표: 서버 요청 종료 ${label} ${Date.now() - started}ms`);
    }
  };
}
