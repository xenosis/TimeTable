-- TimeTable 보안 규칙(RLS) 실행 검증 (백로그 P6.3)
--
-- 역할(아빠 A, 딸 기기 A, 다른 가족 아빠 B, 가족 없는 사용자, 로그인 안 한 사용자)별로 허용·거부를 확인한다.
-- 전부 한 트랜잭션 안에서 하고, 마지막에 결과를 담은 오류를 일부러 내어 모두 되돌린다(가짜 사용자·데이터가 남지 않는다).
-- 실행: npx supabase db query --linked --project-ref <ref> -f supabase/tests/tt_rls_check.sql
-- 결과: 오류 메시지의 'TT_RLS_RESULT' 뒤 JSON. 각 항목은 [검사 이름, 기대, 실제]. 기대와 실제가 모두 같아야 통과다.

begin;

-- 결과는 역할과 상관없이 쓸 수 있는 세션 설정 값에 모은다
select set_config('tt.r', '[]', true);

-- 가짜 사용자(트랜잭션을 되돌리면 사라진다). example.invalid 주소라 메일도 가지 않는다.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-00000000a001', 'authenticated', 'authenticated', 'tt-check-dad-a@example.invalid'),
  ('00000000-0000-4000-8000-00000000a002', 'authenticated', 'authenticated', 'tt-check-child-a@example.invalid'),
  ('00000000-0000-4000-8000-00000000b001', 'authenticated', 'authenticated', 'tt-check-dad-b@example.invalid'),
  ('00000000-0000-4000-8000-00000000c001', 'authenticated', 'authenticated', 'tt-check-outsider@example.invalid');

-- 검사 한 건을 실행하고 기록한다. 실행할 문장은 현재 역할로 돈다(security invoker).
-- expected: 'allowed'(오류 없이 1행 이상 바뀌거나 보임), 'denied'(오류 또는 0행)
create function pg_temp.tt_check(p_name text, p_expected text, p_sql text) returns void
language plpgsql security invoker as $$
declare
  v_rows bigint;
  v_actual text;
begin
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
    v_actual := case when v_rows > 0 then 'allowed' else 'denied' end;
  exception when others then
    v_actual := 'denied';
  end;
  perform set_config('tt.r', (current_setting('tt.r')::jsonb || jsonb_build_array(jsonb_build_array(p_name, p_expected, v_actual)))::text, true);
end;
$$;
grant execute on function pg_temp.tt_check(text, text, text) to authenticated, anon;
-- 역할을 바꿔도 이 세션의 임시 스키마에 있는 검사 함수를 부를 수 있게 한다(pg_temp라는 이름으로는 권한을 줄 수 없다)
do $$ begin execute format('grant usage on schema %I to authenticated, anon', pg_my_temp_schema()::regnamespace::text); end $$;

-- ---------------------------------------------------------------------------
-- 아빠 A: 가족을 만들고 딸 A를 구성원으로 넣는다
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a001","role":"authenticated"}', true);
select set_config('tt.fam_a', public.tt_create_family('검증 가족 A', '아빠')::text, true);
select pg_temp.tt_check('아빠A: 딸을 구성원으로 추가', 'allowed',
  format($q$insert into public.tt_family_members (family_id, user_id, role, display_name) values (%L, '00000000-0000-4000-8000-00000000a002', 'child', '딸')$q$, current_setting('tt.fam_a')));
select pg_temp.tt_check('아빠A: 할 일 추가', 'allowed',
  format($q$insert into public.tt_tasks (family_id, title, repeat_weekdays, effective_from) values (%L, '검증 할 일', '{1}', '2026-10-01')$q$, current_setting('tt.fam_a')));
select pg_temp.tt_check('아빠A: 가족 이름 변경', 'allowed',
  format($q$update public.tt_families set name = '검증 가족 A2' where id = %L$q$, current_setting('tt.fam_a')));
select pg_temp.tt_check('아빠A: 자기 기기 등록', 'allowed',
  format($q$insert into public.tt_devices (family_id, user_id) values (%L, '00000000-0000-4000-8000-00000000a001')$q$, current_setting('tt.fam_a')));

-- ---------------------------------------------------------------------------
-- 딸 A: 가족 데이터 읽기·쓰기는 모두 허용(D7·2026-10-05 결정), 가족·구성원 관리는 불가
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a002","role":"authenticated"}', true);
select pg_temp.tt_check('딸A: 가족 할 일 읽기', 'allowed', 'select 1 from public.tt_tasks');
select pg_temp.tt_check('딸A: 할 일 추가', 'allowed',
  format($q$insert into public.tt_tasks (family_id, title, task_date) values (%L, '딸 할 일', '2026-10-05')$q$, current_setting('tt.fam_a')));
select pg_temp.tt_check('딸A: 지난 날짜 완료 체크', 'allowed',
  format($q$insert into public.tt_task_completions (family_id, task_id, completion_date) select %L, id, '2026-09-01' from public.tt_tasks limit 1$q$, current_setting('tt.fam_a')));
select pg_temp.tt_check('딸A: 보석 개수 기록', 'allowed',
  format($q$insert into public.tt_sticker_ledger (family_id, child_id, delta, reason) values (%L, '00000000-0000-4000-8000-00000000a002', 3, 'manual-count:check')$q$, current_setting('tt.fam_a')));
select pg_temp.tt_check('딸A: 보상 목표 추가', 'allowed',
  format($q$insert into public.tt_rewards (family_id, title, sticker_goal) values (%L, '레고', 10)$q$, current_setting('tt.fam_a')));
select pg_temp.tt_check('딸A: 교시 추가', 'allowed',
  format($q$insert into public.tt_periods (family_id, period_no, start_time, end_time) values (%L, 1, '09:00', '09:40')$q$, current_setting('tt.fam_a')));
select pg_temp.tt_check('딸A: 휴일 추가', 'allowed',
  format($q$insert into public.tt_day_exceptions (family_id, start_date, end_date, type) values (%L, '2026-10-09', '2026-10-09', 'holiday')$q$, current_setting('tt.fam_a')));
select pg_temp.tt_check('딸A: 가족 이름 변경', 'denied',
  format($q$update public.tt_families set name = '딸이 바꿈' where id = %L$q$, current_setting('tt.fam_a')));
select pg_temp.tt_check('딸A: 구성원 추가', 'denied',
  format($q$insert into public.tt_family_members (family_id, user_id, role) values (%L, '00000000-0000-4000-8000-00000000c001', 'parent')$q$, current_setting('tt.fam_a')));
select pg_temp.tt_check('딸A: 자기를 아빠로 바꾸기', 'denied',
  $q$update public.tt_family_members set role = 'parent' where user_id = '00000000-0000-4000-8000-00000000a002'$q$);
select pg_temp.tt_check('딸A: 아빠 기기 정보 읽기', 'denied',
  $q$select 1 from public.tt_devices where user_id = '00000000-0000-4000-8000-00000000a001'$q$);
select pg_temp.tt_check('딸A: 다른 가족 만들기', 'denied', $q$select public.tt_create_family('딸 가족', '딸')$q$);

-- ---------------------------------------------------------------------------
-- 다른 가족 아빠 B: 가족 A의 데이터는 보이지도 바뀌지도 않는다
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b001","role":"authenticated"}', true);
select set_config('tt.fam_b', public.tt_create_family('검증 가족 B', '아빠B')::text, true);
select pg_temp.tt_check('아빠B: 가족A 할 일 읽기', 'denied', 'select 1 from public.tt_tasks');
select pg_temp.tt_check('아빠B: 가족A에 할 일 추가', 'denied',
  format($q$insert into public.tt_tasks (family_id, title, task_date) values (%L, '침입', '2026-10-05')$q$, current_setting('tt.fam_a')));
select pg_temp.tt_check('아빠B: 가족A 할 일 수정', 'denied', $q$update public.tt_tasks set title = '침입'$q$);
select pg_temp.tt_check('아빠B: 가족A 할 일 삭제', 'denied', 'delete from public.tt_tasks');
select pg_temp.tt_check('아빠B: 가족A 보석 기록 읽기', 'denied', 'select 1 from public.tt_sticker_ledger');
select pg_temp.tt_check('아빠B: 자기를 가족A 구성원으로 넣기', 'denied',
  format($q$insert into public.tt_family_members (family_id, user_id, role) values (%L, '00000000-0000-4000-8000-00000000b001', 'parent')$q$, current_setting('tt.fam_a')));
select pg_temp.tt_check('아빠B: 자기 가족 할 일 추가', 'allowed',
  format($q$insert into public.tt_tasks (family_id, title, task_date) values (%L, 'B 할 일', '2026-10-05')$q$, current_setting('tt.fam_b')));

-- ---------------------------------------------------------------------------
-- 가족 없는 로그인 사용자와 로그인 안 한 사용자
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}', true);
select pg_temp.tt_check('가족 없음: 가족 목록 읽기', 'denied', 'select 1 from public.tt_families');
select pg_temp.tt_check('가족 없음: 할 일 읽기', 'denied', 'select 1 from public.tt_tasks');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.tt_check('anon: 할 일 읽기', 'denied', 'select 1 from public.tt_tasks');
select pg_temp.tt_check('anon: 가족 만들기', 'denied', $q$select public.tt_create_family('anon 가족', '')$q$);
select pg_temp.tt_check('anon: 가족 추가', 'denied', $q$insert into public.tt_families (name) values ('anon')$q$);

-- 결과를 내보내며 모두 되돌린다
reset role;
do $$ begin raise exception 'TT_RLS_RESULT %', current_setting('tt.r'); end $$;
