-- 임시 가족 안에서 실행하고 마지막 예외로 전체 롤백한다. 실제 가족 데이터는 건드리지 않는다.
begin;
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-000000006801', 'authenticated', 'authenticated', 'tt-p68-parent@example.invalid'),
  ('00000000-0000-4000-8000-000000006802', 'authenticated', 'authenticated', 'tt-p68-child@example.invalid'),
  ('00000000-0000-4000-8000-000000006803', 'authenticated', 'authenticated', 'tt-p68-other@example.invalid');
insert into public.tt_families (id, name) values
  ('00000000-0000-4000-8000-000000006811', 'P6.8 검증 가족'),
  ('00000000-0000-4000-8000-000000006812', 'P6.8 다른 가족');
insert into public.tt_family_members (family_id, user_id, role) values
  ('00000000-0000-4000-8000-000000006811', '00000000-0000-4000-8000-000000006801', 'parent'),
  ('00000000-0000-4000-8000-000000006811', '00000000-0000-4000-8000-000000006802', 'child'),
  ('00000000-0000-4000-8000-000000006812', '00000000-0000-4000-8000-000000006803', 'parent');
insert into public.tt_gem_rights (id, family_id, child_id, earned_date, state, requested_at) values
  (96801, '00000000-0000-4000-8000-000000006811', '00000000-0000-4000-8000-000000006802', '2026-01-01', 'requested', now()),
  (96802, '00000000-0000-4000-8000-000000006811', '00000000-0000-4000-8000-000000006802', '2026-01-02', 'requested', now()),
  (96803, '00000000-0000-4000-8000-000000006811', '00000000-0000-4000-8000-000000006802', '2026-01-03', 'available', null);
create function pg_temp.check_given(p_ids bigint[], expected integer) returns void
language plpgsql security invoker as $$
declare actual integer;
begin
  begin
    actual := public.tt_mark_gems_given('00000000-0000-4000-8000-000000006811', p_ids);
  exception when others then
    if sqlstate = 'P0001' and sqlerrm like 'TT_GIVEN:%' then actual := -1;
    else raise; end if;
  end;
  if actual <> expected then raise exception 'TT_GIVEN_TEST_FAILED: expected %, actual %', expected, actual; end if;
end;
$$;
grant execute on function pg_temp.check_given(bigint[], integer) to authenticated;
do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace::text); end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000006802","role":"authenticated"}', true);
select pg_temp.check_given(array[96801]::bigint[], -1); -- 딸 거부
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000006803","role":"authenticated"}', true);
select pg_temp.check_given(array[96801]::bigint[], -1); -- 다른 가족 아빠 거부
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000006801","role":"authenticated"}', true);
select pg_temp.check_given(array[96801, 96801]::bigint[], -1); -- 중복 ID
select pg_temp.check_given(array[]::bigint[], -1); -- 빈 요청
select pg_temp.check_given(null, -1); -- 잘못된 입력
select pg_temp.check_given(array[96801, 96999]::bigint[], -1); -- 일부만 유효해도 전부 거부
select pg_temp.check_given(array[96803]::bigint[], -1); -- 요청하지 않은 자격 거부
select pg_temp.check_given(array[96801]::bigint[], 1);
select set_config('tt.given.time', (select given_at::text from public.tt_gem_rights where id = 96801), true);
select pg_temp.check_given(array[96801]::bigint[], 1); -- 같은 요청 재시도 성공
reset role;
do $$ begin
  if (select state from public.tt_gem_rights where id = 96802) <> 'requested'
     or (select given_at::text from public.tt_gem_rights where id = 96801) <> current_setting('tt.given.time')
     or (select count(*) from public.tt_gem_rights where id in (96801, 96802) and state = 'given') <> 1
     or has_function_privilege('anon', 'public.tt_mark_gems_given(uuid,bigint[])', 'EXECUTE') then
    raise exception 'TT_GIVEN_TEST_FAILED: 상태·중복·익명 권한 검증 실패';
  end if;
  raise exception 'TT_GIVEN_RESULT: 10 checks PASS; transaction rolled back';
end $$;
