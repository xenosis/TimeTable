-- migration과 함께 BEGIN 안에서 실행한 뒤 ROLLBACK한다. 실제 가족은 수정하지 않는다.
do $$
declare
  test_family uuid := gen_random_uuid();
  first_event uuid;
  second_event uuid;
  first_order bigint;
  test_user uuid := gen_random_uuid();
  test_device uuid := gen_random_uuid();
  old_ticket text := gen_random_uuid()::text;
  new_ticket text := gen_random_uuid()::text;
begin
  insert into public.tt_families(id, name) values(test_family, '푸시 큐 임시 검증');
  insert into public.tt_timetable_sets(family_id, name) values(test_family, '임시 세트');
  select event_id, event_order into first_event, first_order
    from tt_private.push_changes where family_id = test_family;
  if first_event is null then raise exception 'TT_PUSH_TEST: 저장 시 발송 기록 누락'; end if;
  update tt_private.push_changes set lease_event = first_event, lease_until = now() + interval '2 minutes'
    where family_id = test_family;
  update public.tt_timetable_sets set name = '바꾼 세트' where family_id = test_family;
  select event_id into second_event from tt_private.push_changes where family_id = test_family;
  if second_event = first_event or not exists (
    select 1 from tt_private.push_changes where family_id = test_family
      and event_order > first_order and lease_event = first_event
  ) then raise exception 'TT_PUSH_TEST: 새 변경 또는 기존 발송 임대 보존 실패'; end if;
  if (select count(*) from tt_private.push_changes where family_id = test_family) <> 1 then
    raise exception 'TT_PUSH_TEST: 가족 변경 병합 실패';
  end if;
  if has_table_privilege('authenticated', 'tt_private.push_changes', 'SELECT')
    or has_table_privilege('anon', 'tt_private.push_changes', 'SELECT') then
    raise exception 'TT_PUSH_TEST: 내부 발송 기록 노출';
  end if;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update tt_private.push_changes set lease_event = null, lease_until = null where family_id = test_family;
  select event_id into first_event from public.tt_claim_push_changes(test_family);
  if first_event is null then raise exception 'TT_PUSH_TEST: 발송 대기 획득 실패'; end if;
  if exists(select 1 from public.tt_claim_push_changes(test_family)) then
    raise exception 'TT_PUSH_TEST: 임대 중 중복 획득';
  end if;
  update public.tt_timetable_sets set name = '발송 중 새 변경' where family_id = test_family;
  if not public.tt_finish_push_change(test_family, first_event, true) then
    raise exception 'TT_PUSH_TEST: 이전 발송 완료 처리 실패';
  end if;
  if not exists(select 1 from tt_private.push_changes where family_id = test_family
    and event_id <> first_event and lease_event is null) then
    raise exception 'TT_PUSH_TEST: 이전 발송 완료가 새 변경을 지움';
  end if;
  select event_id into second_event from public.tt_claim_push_changes(test_family);
  if not public.tt_finish_push_change(test_family, second_event, true) then
    raise exception 'TT_PUSH_TEST: 현재 발송 완료 실패';
  end if;
  if exists(select 1 from tt_private.push_changes where family_id = test_family) then
    raise exception 'TT_PUSH_TEST: 현재 발송 완료 후 기록 정리 실패';
  end if;
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin
    perform public.tt_claim_push_changes(test_family);
    raise exception 'TT_PUSH_TEST: 무권한 발송 획득 허용';
  exception when raise_exception then
    if sqlerrm not like 'TT_PUSH: %' then raise; end if;
  end;
  update public.tt_timetable_sets set name = '삭제 전 마지막 변경' where family_id = test_family;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into auth.users(id, aud, role, email) values(test_user, 'authenticated', 'authenticated', test_user::text || '@example.invalid');
  insert into public.tt_family_members(family_id, user_id, role) values(test_family, test_user, 'child');
  insert into public.tt_devices(id, family_id, user_id, push_token)
    values(test_device, test_family, test_user, 'ExpoPushToken[old]');
  select event_id into first_event from public.tt_claim_push_changes(test_family);
  perform public.tt_record_push_tickets(test_family, first_event, jsonb_build_array(jsonb_build_object(
    'deviceId', test_device, 'token', 'ExpoPushToken[old]', 'ticketId', old_ticket
  )));
  if exists(select 1 from public.tt_claim_push_receipts(test_family)) then
    raise exception 'TT_PUSH_TEST: receipt 조회 대기 시간 미적용';
  end if;
  update public.tt_devices set push_token = 'ExpoPushToken[new]' where id = test_device;
  update tt_private.push_receipts set check_after = now() - interval '1 second' where ticket_id = old_ticket;
  if not exists(select 1 from public.tt_claim_push_receipts(test_family) where ticket_id = old_ticket) then
    raise exception 'TT_PUSH_TEST: receipt 조회 대상 누락';
  end if;
  perform public.tt_finish_push_receipt(old_ticket, 'error', 'DeviceNotRegistered');
  if (select push_token from public.tt_devices where id = test_device) is distinct from 'ExpoPushToken[new]' then
    raise exception 'TT_PUSH_TEST: 이전 receipt가 새 토큰 삭제';
  end if;
  perform public.tt_record_push_tickets(test_family, first_event, jsonb_build_array(jsonb_build_object(
    'deviceId', test_device, 'token', 'ExpoPushToken[new]', 'ticketId', new_ticket
  )));
  perform public.tt_finish_push_receipt(new_ticket, 'error', 'DeviceNotRegistered');
  if exists(select 1 from public.tt_devices where id = test_device and push_token is not null) then
    raise exception 'TT_PUSH_TEST: 현재 만료 토큰 미해제';
  end if;
  delete from public.tt_families where id = test_family;
  if exists(select 1 from tt_private.push_changes where family_id = test_family) then
    raise exception 'TT_PUSH_TEST: 삭제된 가족의 기록 잔존';
  end if;
  delete from auth.users where id = test_user;
  raise notice 'TT_PUSH_QUEUE_OK: 저장 기록·변경 병합·중복 임대 차단·새 변경 보존·권한·가족 삭제 검증';
end;
$$;
