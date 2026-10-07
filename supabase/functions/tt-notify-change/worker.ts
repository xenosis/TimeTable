import { changePushHandler } from './handler.ts';

type WorkerEnvironment = { url: string; serviceKey: string; workerSecret: string; expoAccessToken?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function matchesSecret(actual: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const hash = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  const [left, right] = await Promise.all([hash(actual), hash(expected)]);
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

/** 사용자 앱과 별도 엔드포인트다. 전용 비밀 값 확인 후에만 서버 역할로 대기 기록을 처리한다. */
export function pushWorkerHandler(environment: WorkerEnvironment, fetcher: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    const secret = request.headers.get('x-tt-push-worker') ?? '';
    if (environment.workerSecret.length < 32 || secret.length > 256 || !await matchesSecret(secret, environment.workerSecret)) {
      return Response.json({ error: 'worker_authentication_required' }, { status: 401 });
    }
    try {
      const response = await fetcher(`${environment.url}/rest/v1/rpc/tt_due_push_families`, {
        method: 'POST', headers: { apikey: environment.serviceKey, Authorization: `Bearer ${environment.serviceKey}`, 'Content-Type': 'application/json' },
        body: '{}', signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('queue_unavailable');
      const rows: unknown = await response.json();
      if (!Array.isArray(rows) || rows.length > 3) throw new Error('invalid_worker_response');
      const handler = changePushHandler({ url: environment.url, key: environment.serviceKey, serviceWorker: true, expoAccessToken: environment.expoAccessToken }, fetcher);
      let failed = 0;
      for (const row of rows) {
        if (!row || typeof row.family_id !== 'string' || !uuid.test(row.family_id)) throw new Error('invalid_worker_response');
        const result = await handler(new Request(request.url, { method: 'POST',
          headers: { Authorization: `Bearer ${environment.serviceKey}` }, body: JSON.stringify({ familyId: row.family_id }) }));
        if (!result.ok) failed++;
      }
      return Response.json({ processed: rows.length, failed }, { status: failed ? 503 : 200 });
    } catch { return Response.json({ error: 'worker_unavailable' }, { status: 503 }); }
  };
}
