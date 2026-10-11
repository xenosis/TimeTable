import { processPushReceipts } from './receipts.ts';

type Environment = { url: string; serviceKey: string; expoAccessToken?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tokenPattern = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

/** 서버가 검증한 오늘 전체 완료만 아빠 토큰에 전송한다. 실패는 임대를 해제해 재시도한다. */
export async function processCompletionNotices(environment: Environment, fetcher: typeof fetch = fetch) {
  const rpc = async (name: string, body: object) => {
    const response = await fetcher(`${environment.url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: environment.serviceKey, Authorization: `Bearer ${environment.serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('completion_queue_unavailable');
    const raw = await response.text();
    return raw.trim() ? JSON.parse(raw) as unknown : null;
  };
  let failed = 0;
  try {
    await processPushReceipts('', (name, body) => name === 'tt_claim_push_receipts'
      ? rpc('tt_claim_completion_receipts', {}) : rpc('tt_finish_completion_receipt', body), fetcher, environment.expoAccessToken);
  } catch {
    // 미완료 receipt는 DB에 남기고 새 알림 발송은 계속 처리한다.
    failed++;
  }
  const rows = await rpc('tt_claim_completion_notices', {});
  if (!Array.isArray(rows) || rows.length > 3) throw new Error('invalid_completion_queue');
  for (const row of rows) {
    if (!row || typeof row.family_id !== 'string' || !uuid.test(row.family_id)
      || typeof row.completion_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.completion_date)
      || !Number.isSafeInteger(row.event_order) || row.event_order <= 0 || typeof row.lease_id !== 'string' || !uuid.test(row.lease_id)
      || !Array.isArray(row.tokens) || row.tokens.length > 1000) throw new Error('invalid_completion_queue');
    const tokens = [...new Set<string>(row.tokens.filter((token: unknown): token is string => typeof token === 'string' && tokenPattern.test(token)))];
    const tickets: { token: string; ticketId: string | null; error: string | null }[] = [];
    let success = tokens.length > 0;
    try {
      for (let offset = 0; offset < tokens.length; offset += 100) {
        const batch = tokens.slice(offset, offset + 100);
        const response = await fetcher('https://exp.host/--/api/v2/push/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(environment.expoAccessToken ? { Authorization: `Bearer ${environment.expoAccessToken}` } : {}) },
          body: JSON.stringify(batch.map((to) => ({ to, priority: 'high', ttl: 300, data: {
            type: 'tasks-completed', familyId: row.family_id, completionDate: row.completion_date, changeOrder: row.event_order,
          } }))), signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error('completion_push_unavailable');
        const payload = await response.json() as { data?: { status?: string; id?: string; details?: { error?: string } }[] };
        if (!Array.isArray(payload.data) || payload.data.length !== batch.length) throw new Error('invalid_completion_tickets');
        for (const [index, ticket] of payload.data.entries()) {
          if (ticket?.status !== 'ok' || typeof ticket.id !== 'string' || !uuid.test(ticket.id)) success = false;
          tickets.push({ token: batch[index], ticketId: ticket?.status === 'ok' && typeof ticket.id === 'string' && uuid.test(ticket.id) ? ticket.id : null,
            error: typeof ticket?.details?.error === 'string' ? ticket.details.error : null });
        }
      }
    } catch { success = false; }
    await rpc('tt_finish_completion_notice', {
      p_family: row.family_id, p_date: row.completion_date, p_order: row.event_order,
      p_lease: row.lease_id, p_success: success, p_tickets: tickets,
    });
    if (!success) failed++;
  }
  // Expo 접수는 실기기 도착 보장이 아니다. 별도 수신 검증이 필요하다.
  return { processed: rows.length, failed };
}
