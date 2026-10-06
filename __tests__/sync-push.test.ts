import { isEmptyPlan, ledgerKey, planChildPush, toIso, type ChildRecords } from '../src/sync/pushChildRecords';

jest.mock('../src/server/supabaseClient', () => ({ getSupabase: () => { throw new Error('이 테스트는 서버를 부르지 않는다'); } }));

const FAMILY = 'fam-1';
const CHILD = 'child-uid';
const none: ChildRecords = { completions: [], history: [], ledger: [], gems: [] };

test('같은 기록이면 올릴 것이 없다(서버 ISO 시각과 폰 SQLite 시각을 같은 것으로 본다)', () => {
  const local: ChildRecords = {
    completions: [{ id: 1, task_id: 7001, completion_date: '2026-10-07', done_at: '2026-10-07 01:00:00', done_by: 'child' }],
    history: [{ task_id: 7001, completion_date: '2026-10-07' }],
    ledger: [{ id: 5, delta: 3, reason: 'manual-count:gem', task_id: null, created_at: '2026-10-07 01:02:03' }],
    gems: [{ id: 2, earned_date: '2026-10-05', state: 'requested' }],
  };
  const server: ChildRecords = {
    completions: [{ id: 91, task_id: 7001, completion_date: '2026-10-07', done_at: '2026-10-07T01:00:00+00:00' }],
    history: [{ task_id: 7001, completion_date: '2026-10-07' }],
    ledger: [{ id: 95, delta: 3, reason: 'manual-count:gem', task_id: null, created_at: '2026-10-07T01:02:03+00:00' }],
    gems: [{ id: 92, earned_date: '2026-10-05', state: 'requested' }],
  };
  expect(isEmptyPlan(planChildPush(local, server, FAMILY, CHILD))).toBe(true);
});

test('폰에서 체크하면 넣고, 체크를 취소하면 서버에서 지우되 완료 이력은 남긴다', () => {
  const local: ChildRecords = { ...none, completions: [{ task_id: 7002, completion_date: '2026-10-07', done_at: '2026-10-07 02:00:00', done_by: 'child' }], history: [{ task_id: 7002, completion_date: '2026-10-07' }] };
  const server: ChildRecords = { ...none, completions: [{ id: 91, task_id: 7001, completion_date: '2026-10-07' }], history: [{ task_id: 7001, completion_date: '2026-10-07' }] };
  const plan = planChildPush(local, server, FAMILY, CHILD);
  expect(plan.completionInserts).toEqual([{ family_id: FAMILY, task_id: 7002, completion_date: '2026-10-07', done_at: '2026-10-07T02:00:00Z', done_by: 'child' }]);
  expect(plan.completionDeletes).toEqual([91]);
  expect(plan.historyInserts).toEqual([{ family_id: FAMILY, task_id: 7002, completion_date: '2026-10-07' }]);
});

test('장부: 하루 완료는 사유로 비교하고, 조정은 같은 시각·수량이 두 번이면 두 줄로 센다', () => {
  expect(ledgerKey({ reason: 'daily-completion:2026-10-07', delta: 0, created_at: 'x' })).toBe('daily-completion:2026-10-07');
  const local: ChildRecords = { ...none, ledger: [
    { reason: 'daily-completion:2026-10-07', delta: 0, task_id: null, created_at: '2026-10-07 09:00:00' },
    { reason: 'manual-count:gem', delta: 1, task_id: null, created_at: '2026-10-07 09:00:00' },
    { reason: 'manual-count:gem', delta: 1, task_id: null, created_at: '2026-10-07 09:00:00' },
  ] };
  const server: ChildRecords = { ...none, ledger: [
    { id: 1, reason: 'daily-completion:2026-10-07', delta: 0, created_at: '2026-10-07T08:59:00+00:00' },
    { id: 2, reason: 'manual-count:gem', delta: 1, created_at: '2026-10-07T09:00:00+00:00' },
    { id: 3, reason: 'daily-completion:2026-10-06', delta: 0, created_at: '2026-10-06T09:00:00+00:00' },
  ] };
  const plan = planChildPush(local, server, FAMILY, CHILD);
  expect(plan.ledgerInserts).toEqual([{ family_id: FAMILY, child_id: CHILD, delta: 1, reason: 'manual-count:gem', task_id: null, created_at: '2026-10-07T09:00:00Z' }]);
  // 폰에서 취소한 10월 6일 하루 완료는 서버에서도 지운다
  expect(plan.ledgerDeletes).toEqual([3]);
});

test('보석 자격: 폰이 더 나아간 상태면 올리고, 서버가 줬어요면 서버 것을 두며, 서버에만 있는 받을 수 있음 자격만 지운다', () => {
  const local: ChildRecords = { ...none, gems: [
    { earned_date: '2026-10-05', state: 'requested', requested_at: '2026-10-07 01:00:00', given_at: null, created_at: '2026-10-05 00:00:00' },
    { earned_date: '2026-09-30', state: 'requested', requested_at: '2026-10-01 01:00:00', given_at: null, created_at: '2026-09-30 00:00:00' },
  ] };
  const server: ChildRecords = { ...none, gems: [
    { id: 1, earned_date: '2026-10-05', state: 'available' },
    { id: 2, earned_date: '2026-09-30', state: 'given' },
    { id: 3, earned_date: '2026-09-25', state: 'available' },
    { id: 4, earned_date: '2026-09-20', state: 'given' },
  ] };
  const plan = planChildPush(local, server, FAMILY, CHILD);
  expect(plan.gemUpserts).toEqual([{ family_id: FAMILY, child_id: CHILD, earned_date: '2026-10-05', state: 'requested', requested_at: '2026-10-07T01:00:00Z', given_at: null, created_at: '2026-10-05T00:00:00Z' }]);
  expect(plan.gemDeletes).toEqual([3]);
});

test('로컬 시각을 서버용 ISO로 바꾼다', () => {
  expect(toIso('2026-10-07 01:02:03')).toBe('2026-10-07T01:02:03Z');
  expect(toIso(null)).toBeNull();
});
