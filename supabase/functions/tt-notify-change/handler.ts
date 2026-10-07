import { processPushReceipts } from './receipts.ts';

type PushEnvironment = { url: string; key: string; expoAccessToken?: string; serviceWorker?: boolean };
type Fetcher = typeof fetch;
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tokenPattern = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;
const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });

/** 호출자 JWT와 가족의 아빠 역할을 확인한다. 서비스 역할 키와 임의 발신자 ID는 사용하지 않는다. */
export function changePushHandler(environment: PushEnvironment, fetcher: Fetcher = fetch) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return reply(200, { ok: true });
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return reply(401, { error: 'authentication_required' });
    let familyId: string;
    try {
      const raw = await request.text();
      if (raw.length > 8192) return reply(413, { error: 'request_too_large' });
      const body: unknown = JSON.parse(raw);
      if (!body || typeof body !== 'object' || !('familyId' in body) || typeof body.familyId !== 'string' || !uuid.test(body.familyId)) return reply(400, { error: 'invalid_family' });
      familyId = body.familyId;
    } catch { return reply(400, { error: 'invalid_request' }); }
    const authHeaders = { apikey: environment.key, Authorization: authorization };
    const rpc = async (name: string, body: object) => {
      const response = await fetcher(`${environment.url}/rest/v1/rpc/${name}`, {
        method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('queue_unavailable');
      return await response.json() as unknown;
    };
    const readRows = async (table: string, filters: Record<string, string>) => {
      const response = await fetcher(`${environment.url}/rest/v1/${table}?${new URLSearchParams(filters)}`, { headers: authHeaders, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error('database_unavailable');
      const rows: unknown = await response.json();
      if (!Array.isArray(rows)) throw new Error('invalid_database_response');
      return rows as Record<string, unknown>[];
    };
    try {
      if (!environment.serviceWorker) {
      const authentication = await fetcher(`${environment.url}/auth/v1/user`, { headers: authHeaders, signal: AbortSignal.timeout(10_000) });
      if (authentication.status === 401 || authentication.status === 403) return reply(401, { error: 'invalid_session' });
      if (!authentication.ok) return reply(503, { error: 'authentication_unavailable' });
      const user = await authentication.json() as { id?: unknown };
      if (typeof user.id !== 'string' || !uuid.test(user.id)) return reply(401, { error: 'invalid_session' });
      const membership = await readRows('tt_family_members', { select: 'user_id', family_id: `eq.${familyId}`, user_id: `eq.${user.id}`, role: 'eq.parent' });
      if (membership.length !== 1) return reply(403, { error: 'parent_required' });
      }
      await processPushReceipts(familyId, rpc, fetcher, environment.expoAccessToken);
      const claims = await rpc('tt_claim_push_changes', { p_family: familyId });
      if (!Array.isArray(claims)) throw new Error('invalid_queue_response');
      if (claims.length === 0) return reply(200, { accepted: 0, reason: 'no_pending_change' });
      const claim = claims[0] as { family_id?: unknown; event_id?: unknown; event_order?: unknown };
      if (claim.family_id !== familyId || typeof claim.event_id !== 'string' || !uuid.test(claim.event_id)
        || !Number.isSafeInteger(claim.event_order) || Number(claim.event_order) <= 0) throw new Error('invalid_queue_response');
      const children = await readRows('tt_family_members', { select: 'user_id', family_id: `eq.${familyId}`, role: 'eq.child' });
      const childIds = children.map((row) => row.user_id).filter((id): id is string => typeof id === 'string' && uuid.test(id));
      if (!childIds.length) {
        await rpc('tt_finish_push_change', { p_family: familyId, p_event: claim.event_id, p_success: false });
        return reply(200, { accepted: 0, reason: 'no_child' });
      }
      const devices = await readRows('tt_devices', { select: 'id,push_token', family_id: `eq.${familyId}`, user_id: `in.(${childIds.join(',')})`, push_token: 'not.is.null' });
      const recipients = new Map<string, string>();
      for (const device of devices) {
        if (typeof device.id === 'string' && uuid.test(device.id) && typeof device.push_token === 'string' && tokenPattern.test(device.push_token)) {
          recipients.set(device.push_token, device.id);
        }
      }
      const tokens = [...recipients.keys()];
      let accepted = 0;
      let failed = 0;
      for (let offset = 0; offset < tokens.length; offset += 100) {
        const batch = tokens.slice(offset, offset + 100).map((to) => ({ to, priority: 'high', ttl: 300,
          data: { type: 'family-change', familyId, changeId: claim.event_id, changeOrder: claim.event_order } }));
        const response = await fetcher('https://exp.host/--/api/v2/push/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(environment.expoAccessToken ? { Authorization: `Bearer ${environment.expoAccessToken}` } : {}) },
          body: JSON.stringify(batch), signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error('push_unavailable');
        const payload = await response.json() as { data?: { status?: string; id?: string; details?: { error?: string } }[] };
        if (!Array.isArray(payload.data) || payload.data.length !== batch.length) throw new Error('invalid_push_response');
        if (payload.data.some((ticket) => !ticket || (ticket.status !== 'ok' && ticket.status !== 'error')
          || (ticket.status === 'ok' && (typeof ticket.id !== 'string' || !uuid.test(ticket.id))))) throw new Error('invalid_push_response');
        const tickets = payload.data.map((ticket, index) => ({ deviceId: recipients.get(batch[index].to), token: batch[index].to,
          ticketId: ticket.id ?? null, error: ticket.details?.error ?? null }));
        await rpc('tt_record_push_tickets', { p_family: familyId, p_event: claim.event_id, p_tickets: tickets });
        accepted += payload.data.filter((ticket) => ticket.status === 'ok').length;
        failed += payload.data.filter((ticket) => ticket.status !== 'ok').length;
      }
      // Expo 접수는 실기기 도착 보장이 아니다. 실제 수신은 별도 검증한다.
      await rpc('tt_finish_push_change', { p_family: familyId, p_event: claim.event_id,
        p_success: tokens.length > 0 && failed === 0 });
      return reply(failed ? 502 : 200, { accepted, failed });
    } catch { return reply(503, { error: 'push_unavailable' }); }
  };
}
