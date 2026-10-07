type Rpc = (name: string, body: object) => Promise<unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Expo 접수 후 FCM 전달 결과를 확인한다. 조회 실패는 기존 기록을 남겨 재시도한다. */
export async function processPushReceipts(familyId: string, rpc: Rpc, fetcher: typeof fetch, expoAccessToken?: string): Promise<void> {
  const claims = await rpc('tt_claim_push_receipts', { p_family: familyId });
  if (!Array.isArray(claims) || claims.length > 100) throw new Error('invalid_receipt_claim');
  const tickets = claims as { ticket_id?: unknown; expired?: unknown }[];
  if (tickets.some((ticket) => typeof ticket.ticket_id !== 'string' || !uuid.test(ticket.ticket_id))) throw new Error('invalid_receipt_claim');
  if (!tickets.length) return;
  const response = await fetcher('https://exp.host/--/api/v2/push/getReceipts', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(expoAccessToken ? { Authorization: `Bearer ${expoAccessToken}` } : {}) },
    body: JSON.stringify({ ids: tickets.map((ticket) => ticket.ticket_id) }), signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('receipt_unavailable');
  const payload = await response.json() as { data?: Record<string, { status?: string; details?: { error?: string } }> };
  if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) throw new Error('invalid_receipt_response');
  for (const ticket of tickets) {
    const id = ticket.ticket_id as string;
    const receipt = payload.data[id];
    if (!receipt) {
      if (ticket.expired === true) await rpc('tt_finish_push_receipt', { p_ticket: id, p_status: 'error', p_error: 'ExpoReceiptMissing' });
      continue;
    }
    if (receipt.status !== 'ok' && receipt.status !== 'error') throw new Error('invalid_receipt_response');
    await rpc('tt_finish_push_receipt', { p_ticket: id, p_status: receipt.status,
      p_error: typeof receipt.details?.error === 'string' ? receipt.details.error : null });
  }
}
