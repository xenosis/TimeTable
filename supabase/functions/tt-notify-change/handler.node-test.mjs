import assert from 'node:assert/strict';
import test from 'node:test';
import { changePushHandler } from './handler.ts';
import { processPushReceipts } from './receipts.ts';
import { pushWorkerHandler } from './worker.ts';

const family = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const dad = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const child = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const event = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const claim = { family_id: family, event_id: event, event_order: 1 };
const deviceId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ticketId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const request = (body = { familyId: family }, authorization = 'Bearer user-session') => new Request('https://test/function', {
  method: 'POST', headers: authorization ? { authorization } : {}, body: JSON.stringify(body),
});
const response = (body, status = 200) => Response.json(body, { status });
const env = { url: 'https://test', key: 'public-key' };

test('인증 정보가 없거나 가족 입력이 잘못되면 전송하지 않는다', async () => {
  const fetcher = async () => { throw new Error('호출하면 안 됨'); };
  const handler = changePushHandler(env, fetcher);
  assert.equal((await handler(request({}, null))).status, 401);
  assert.equal((await handler(request({ familyId: 'invalid' }))).status, 400);
});

test('유효하지 않은 로그인은 가족 조회 전에 거절한다', async () => {
  let calls = 0;
  const handler = changePushHandler(env, async (url) => {
    calls++;
    assert.equal(url, 'https://test/auth/v1/user');
    return response({}, 401);
  });
  assert.equal((await handler(request())).status, 401);
  assert.equal(calls, 1);
});

test('해당 가족 아빠가 아니면 자녀와 토큰을 조회하지 않는다', async () => {
  let calls = 0;
  const handler = changePushHandler(env, async (url) => {
    calls++;
    if (calls === 1) return response({ id: dad });
    const query = new URL(url).searchParams;
    assert.equal(query.get('family_id'), `eq.${family}`);
    assert.equal(query.get('user_id'), `eq.${dad}`);
    assert.equal(query.get('role'), 'eq.parent');
    return response([]);
  });
  assert.equal((await handler(request())).status, 403);
  assert.equal(calls, 2);
});

test('같은 가족 자녀 토큰만 중복 제거하고 가족 식별 데이터로 보낸다', async () => {
  let calls = 0;
  const handler = changePushHandler(env, async (url, options) => {
    if (url.endsWith('/tt_claim_push_receipts')) return response([]);
    if (url.endsWith('/tt_record_push_tickets')) {
      assert.deepEqual(JSON.parse(options.body).p_tickets, [{ deviceId, token: 'ExpoPushToken[abc]', ticketId, error: null }]);
      return new Response(null, { status: 204 });
    }
    calls++;
    if (calls === 1) return response({ id: dad });
    if (calls === 2) return response([{ user_id: dad }]);
    if (calls === 3) {
      assert.equal(url, 'https://test/rest/v1/rpc/tt_claim_push_changes');
      assert.deepEqual(JSON.parse(options.body), { p_family: family });
      return response([claim]);
    }
    if (calls === 4) {
      assert.equal(new URL(url).searchParams.get('role'), 'eq.child');
      return response([{ user_id: child }, { user_id: 'invalid' }]);
    }
    if (calls === 5) {
      const query = new URL(url).searchParams;
      assert.equal(query.get('family_id'), `eq.${family}`);
      assert.equal(query.get('user_id'), `in.(${child})`);
      return response([{ id: deviceId, push_token: 'ExpoPushToken[abc]' }, { id: deviceId, push_token: 'ExpoPushToken[abc]' }, { push_token: 'invalid' }]);
    }
    if (calls === 7) {
      assert.equal(url, 'https://test/rest/v1/rpc/tt_finish_push_change');
      assert.deepEqual(JSON.parse(options.body), { p_family: family, p_event: event, p_success: true });
      return response(true);
    }
    assert.equal(url, 'https://exp.host/--/api/v2/push/send');
    const payload = JSON.parse(options.body);
    assert.equal(payload.length, 1);
    assert.deepEqual(payload[0].data, { type: 'family-change', familyId: family, changeId: event, changeOrder: 1 });
    assert.equal(payload[0].title, undefined);
    assert.equal(payload[0].body, undefined);
    return response({ data: [{ status: 'ok', id: ticketId }] });
  });
  const result = await handler(request());
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { accepted: 1, failed: 0 });
  assert.equal(calls, 7);
});

test('Expo 전송 실패를 수신 성공으로 기록하지 않는다', async () => {
  const replies = [{ id: dad }, [{ user_id: dad }], [claim], [{ user_id: child }], [{ id: deviceId, push_token: 'ExpoPushToken[abc]' }], { data: [{ status: 'error' }] }, true];
  const handler = changePushHandler(env, async (url, options) => {
    if (url.endsWith('/tt_claim_push_receipts')) return response([]);
    if (url.endsWith('/tt_record_push_tickets')) return response(null);
    if (url.endsWith('/tt_finish_push_change')) {
      assert.equal(JSON.parse(options.body).p_success, false);
    }
    return response(replies.shift());
  });
  const result = await handler(request());
  assert.equal(result.status, 502);
  assert.deepEqual(await result.json(), { accepted: 0, failed: 1 });
});

test('저장된 변경의 발송 대기 기록이 없으면 전송하지 않는다', async () => {
  const replies = [{ id: dad }, [{ user_id: dad }], []];
  let calls = 0;
  const handler = changePushHandler(env, async (url) => {
    if (url.endsWith('/tt_claim_push_receipts')) return response([]);
    calls++; return response(replies.shift());
  });
  const result = await handler(request());
  assert.deepEqual(await result.json(), { accepted: 0, reason: 'no_pending_change' });
  assert.equal(calls, 3);
});

test('receipt의 만료 토큰 결과와 정상 접수 결과를 구분해 기록한다', async () => {
  const calls = [];
  const rpc = async (name, body) => {
    calls.push({ name, body });
    return name === 'tt_claim_push_receipts' ? [{ ticket_id: ticketId, expired: false }] : true;
  };
  await processPushReceipts(family, rpc, async (url, options) => {
    assert.equal(url, 'https://exp.host/--/api/v2/push/getReceipts');
    assert.deepEqual(JSON.parse(options.body), { ids: [ticketId] });
    return response({ data: { [ticketId]: { status: 'error', details: { error: 'DeviceNotRegistered' } } } });
  });
  assert.deepEqual(calls[1], { name: 'tt_finish_push_receipt', body: { p_ticket: ticketId, p_status: 'error', p_error: 'DeviceNotRegistered' } });
});

test('receipt 조회 실패는 완료 처리하지 않고 누락된 새 결과도 보존한다', async () => {
  let finished = 0;
  const rpc = async (name) => name === 'tt_claim_push_receipts' ? [{ ticket_id: ticketId, expired: false }] : ++finished;
  await assert.rejects(processPushReceipts(family, rpc, async () => response({}, 503)));
  await processPushReceipts(family, rpc, async () => response({ data: {} }));
  assert.equal(finished, 0);
});

test('전용 작업자 비밀 값이 없거나 다르면 서버 역할 조회를 시작하지 않는다', async () => {
  const handler = pushWorkerHandler({ url: 'https://test', serviceKey: 'server-only', workerSecret: 'test-worker-secret-at-least-32-characters' }, async () => {
    throw new Error('인증 전 조회하면 안 됨');
  });
  assert.equal((await handler(new Request('https://test/worker', { method: 'POST' }))).status, 401);
  assert.equal((await handler(new Request('https://test/worker', { method: 'POST', headers: { 'x-tt-push-worker': 'wrong' } }))).status, 401);
});

test('인증된 작업자는 DB 대기 가족만 처리하고 사용자 로그인 API를 호출하지 않는다', async () => {
  const workerSecret = 'test-worker-secret-at-least-32-characters';
  const calls = [];
  const handler = pushWorkerHandler({ url: 'https://test', serviceKey: 'server-only', workerSecret }, async (url, options) => {
    calls.push(url);
    assert.equal(options.headers.Authorization, 'Bearer server-only');
    if (url.endsWith('/tt_due_push_families')) return response([{ family_id: family }]);
    if (url.endsWith('/tt_claim_push_receipts') || url.endsWith('/tt_claim_push_changes')) {
      assert.deepEqual(JSON.parse(options.body), { p_family: family });
      return response([]);
    }
    throw new Error('예상하지 않은 조회');
  });
  const result = await handler(new Request('https://test/worker', { method: 'POST', headers: { 'x-tt-push-worker': workerSecret } }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { processed: 1, failed: 0 });
  assert.equal(calls.length, 3);
});
