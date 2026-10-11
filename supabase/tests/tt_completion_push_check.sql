-- 마이그레이션을 같은 BEGIN에서 시험 적용한 뒤 전체 ROLLBACK한다.
begin;
do $$
declare
  family uuid := gen_random_uuid();
  dad uuid := gen_random_uuid();
  kid uuid := gen_random_uuid();
  installation uuid := gen_random_uuid();
  today date := (now() at time zone 'Asia/Seoul')::date;
  first_task bigint;
  last_task bigint;
  ignored_task bigint;
  notice record;
  next_notice record;
  ticket uuid := gen_random_uuid();
  count_rows integer;
begin
  insert into auth.users(id, email) values(dad, dad::text || '@example.invalid'), (kid, kid::text || '@example.invalid');
  insert into public.tt_families(id, name) values(family, '완료 푸시 롤백 시험');
  insert into public.tt_family_members(family_id,user_id,role) values(family,dad,'parent'),(family,kid,'child');
  if tt_private.tasks_all_done(family,today) then raise exception '빈 목록 완료로 오인'; end if;
  insert into public.tt_tasks(family_id,title,task_date) values(family,'오늘1',today) returning id into first_task;
  insert into public.tt_tasks(family_id,title,repeat_weekdays,effective_from)
    values(family,'오늘 반복',array[extract(dow from today)::smallint],today) returning id into last_task;
  insert into public.tt_tasks(family_id,title,task_date) values(family,'내일',today+1) returning id into ignored_task;
  insert into public.tt_tasks(family_id,title,task_date,effective_until) values(family,'날짜 지정 종료됨',today,today-1);
  insert into public.tt_tasks(family_id,title,repeat_weekdays,effective_from,effective_until)
    values(family,'종료됨',array[extract(dow from today)::smallint],today-7,today-1);
  insert into public.tt_task_completions(family_id,task_id,completion_date) values(family,first_task,today);
  if exists(select 1 from tt_private.completion_notices where family_id=family) then raise exception '부분 완료 발송'; end if;
  insert into public.tt_task_completions(family_id,task_id,completion_date) values(family,last_task,today);
  if not tt_private.tasks_all_done(family,today) then raise exception '오늘 완료 판정 실패'; end if;
  update public.tt_task_completions set done_at=now() where family_id=family;
  select count(*) into count_rows from tt_private.completion_notices where family_id=family;
  if count_rows<>1 then raise exception '재동기화 중복 이벤트'; end if;
  delete from public.tt_task_completions where family_id=family and task_id=last_task;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  if exists(select 1 from public.tt_claim_completion_notices() where family_id=family) then raise exception '취소 후 발송'; end if;
  insert into public.tt_task_completions(family_id,task_id,completion_date) values(family,last_task,today);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',dad,'role','authenticated')::text,true);
  perform public.tt_register_push_installation(family,installation,repeat('a',64),'ExpoPushToken[test-dad]','1.63.0');
  if not exists(select 1 from public.tt_devices where family_id=family and user_id=dad and push_token='ExpoPushToken[test-dad]') then raise exception '아빠 토큰 등록 실패'; end if;
  begin
    perform public.tt_claim_completion_notices();
    raise exception '인증 사용자 작업자 RPC 허용';
  exception when raise_exception then
    if sqlerrm not like 'TT_PUSH:%' then raise; end if;
  end;
  if has_function_privilege('authenticated','public.tt_claim_completion_notices()','EXECUTE')
    or has_function_privilege('anon','public.tt_claim_completion_notices()','EXECUTE') then raise exception '작업자 RPC 권한 누출'; end if;
  if has_table_privilege('authenticated','tt_private.completion_notices','SELECT') then raise exception '비공개 큐 노출'; end if;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select * into notice from public.tt_claim_completion_notices() where family_id=family;
  if not found or notice.tokens <> '["ExpoPushToken[test-dad]"]'::jsonb then raise exception '아빠 수신 대상 판정 실패'; end if;
  if exists(select 1 from public.tt_claim_completion_notices() where family_id=family) then raise exception '임대 중 중복 발송'; end if;
  update tt_private.completion_notices set lease_until=now()-interval '1 second' where family_id=family;
  select * into next_notice from public.tt_claim_completion_notices() where family_id=family;
  if next_notice.lease_id=notice.lease_id then raise exception '재임대 ID 중복'; end if;
  if public.tt_finish_completion_notice(family,today,notice.event_order,notice.lease_id,false,'[]'::jsonb) then raise exception '이전 종료가 새 임대 해제'; end if;
  notice := next_notice;
  perform public.tt_finish_completion_notice(family,today,notice.event_order,notice.lease_id,false,'[]'::jsonb);
  if exists(select 1 from tt_private.completion_notices where family_id=family and sent) then raise exception '실패를 성공으로 기록'; end if;
  update tt_private.completion_notices set retry_after=now() where family_id=family;
  select * into notice from public.tt_claim_completion_notices() where family_id=family;
  if not found then raise exception '실패 재시도 누락'; end if;
  perform public.tt_finish_completion_notice(family,today,notice.event_order,notice.lease_id,true,
    jsonb_build_array(jsonb_build_object('token','ExpoPushToken[test-dad]','ticketId',ticket,'error',null)));
  if exists(select 1 from public.tt_claim_completion_notices() where family_id=family) then raise exception '접수 후 재발송'; end if;
  if not exists(select 1 from tt_private.completion_receipts where ticket_id=ticket) then raise exception 'ticket 저장 누락'; end if;
  update tt_private.completion_receipts set check_after=now() where ticket_id=ticket;
  if not exists(select 1 from public.tt_claim_completion_receipts() where ticket_id=ticket::text) then raise exception 'receipt 조회 누락'; end if;
  perform public.tt_finish_completion_receipt(ticket::text,'error','ExpoTemporarilyUnavailable');
  if exists(select 1 from tt_private.completion_notices where family_id=family and sent) then raise exception '전달 실패 재시도 누락'; end if;
  update tt_private.completion_notices set retry_after=now() where family_id=family;
  select * into next_notice from public.tt_claim_completion_notices() where family_id=family;
  perform public.tt_finish_completion_notice(family,today,next_notice.event_order,next_notice.lease_id,true,'[]'::jsonb);
  insert into tt_private.completion_receipts(ticket_id,family_id,completion_date,lease_id,push_token)
    values(ticket,family,today,notice.lease_id,'ExpoPushToken[test-dad]');
  perform public.tt_finish_completion_receipt(ticket::text,'error','ExpoTemporarilyUnavailable');
  if not exists(select 1 from tt_private.completion_notices where family_id=family and sent) then raise exception '이전 receipt가 이후 성공 덮어쓰기'; end if;
  insert into tt_private.completion_receipts(ticket_id,family_id,completion_date,lease_id,push_token)
    values(ticket,family,today,next_notice.lease_id,'ExpoPushToken[previous-dad]');
  perform public.tt_finish_completion_receipt(ticket::text,'error','DeviceNotRegistered');
  if not exists(select 1 from public.tt_devices where family_id=family and push_token='ExpoPushToken[test-dad]') then raise exception '이전 결과로 새 토큰 삭제'; end if;
  insert into tt_private.completion_receipts(ticket_id,family_id,completion_date,lease_id,push_token)
    values(ticket,family,today,next_notice.lease_id,'ExpoPushToken[test-dad]');
  perform public.tt_finish_completion_receipt(ticket::text,'error','DeviceNotRegistered');
  if exists(select 1 from public.tt_devices where family_id=family and push_token='ExpoPushToken[test-dad]') then raise exception '만료 현재 토큰 정리 누락'; end if;
  raise notice 'TT_COMPLETION_PUSH_CHECK_OK: 빈 목록, 부분 완료, 반복 기간, 중복, 취소, 역할, 권한, 임대, 실패 재시도, 접수 검증';
end;
$$;
select 'TT_COMPLETION_PUSH_CHECK_OK' as result;
rollback;
