-- 시간표 저장과 발송 대기 기록을 함께 확정한다. 아직 운영 서버에 적용하지 않았다.
create schema if not exists tt_private;
-- 기존 RLS 소속 조회 함수가 사용하는 스키마 권한은 유지한다. 새 객체만 잠근다.

create sequence tt_private.push_event_order;
create table tt_private.push_changes (
  family_id uuid primary key references public.tt_families(id) on delete cascade,
  event_id uuid not null default gen_random_uuid(),
  event_order bigint not null default nextval('tt_private.push_event_order'),
  queued_at timestamptz not null default now(),
  retry_after timestamptz not null default now(),
  lease_event uuid,
  lease_until timestamptz,
  attempts integer not null default 0 check (attempts >= 0)
);
alter table tt_private.push_changes enable row level security;
revoke all on tt_private.push_changes from public, anon, authenticated;
revoke all on sequence tt_private.push_event_order from public, anon, authenticated;
create index push_changes_due_idx on tt_private.push_changes(retry_after);

-- 내부 트리거만 호출한다. 인증 여부와 무관하게 확정된 서버 데이터 변경을 기록한다.
create function tt_private.enqueue_schedule_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_family uuid;
begin
  if tg_table_schema <> 'public' or tg_table_name not in (
    'tt_periods', 'tt_timetable_sets', 'tt_timetable_settings',
    'tt_timetable_items', 'tt_day_exceptions', 'tt_tasks'
  ) then
    raise exception 'TT_PUSH: 잘못된 변경 기록 대상';
  end if;
  if tg_op = 'UPDATE' and new is not distinct from old then
    return new;
  end if;
  if tg_op = 'DELETE' then target_family := old.family_id;
  else target_family := new.family_id;
  end if;
  -- 가족 삭제의 연쇄 삭제에서는 발송할 대상 자체가 사라진다.
  if exists (select 1 from public.tt_families where id = target_family) then
    insert into tt_private.push_changes(family_id) values (target_family)
    on conflict (family_id) do update set
      event_id = gen_random_uuid(),
      event_order = nextval('tt_private.push_event_order'),
      queued_at = now(), retry_after = now(), attempts = 0;
    -- 이전 이벤트의 발송이 진행 중이면 임대를 유지한다. 완료 처리는 이벤트 ID로 비교한다.
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- 부모는 자기 가족만, 서버 작업자는 대기 중인 가족들을 처리할 수 있다.
create function tt_private.claim_push_changes(p_family uuid)
returns table(family_id uuid, event_id uuid, event_order bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    if auth.uid() is null or p_family is null or not exists (
      select 1 from public.tt_family_members m
      where m.family_id = p_family and m.user_id = auth.uid() and m.role = 'parent'
    ) then raise exception 'TT_PUSH: 가족 관리자 권한이 필요해요'; end if;
  end if;
  return query
  with due as (
    select q.family_id from tt_private.push_changes q
    where (p_family is null or q.family_id = p_family)
      and q.retry_after <= now() and (q.lease_until is null or q.lease_until <= now())
    order by q.retry_after limit 20 for update skip locked
  )
  update tt_private.push_changes q set lease_event = q.event_id,
    lease_until = now() + interval '2 minutes', attempts = q.attempts + 1
  from due where q.family_id = due.family_id
  returning q.family_id, q.event_id, q.event_order;
end;
$$;

create function public.tt_claim_push_changes(p_family uuid default null)
returns table(family_id uuid, event_id uuid, event_order bigint)
language sql security invoker set search_path = '' as $$
  select * from tt_private.claim_push_changes(p_family);
$$;
revoke all on function tt_private.claim_push_changes(uuid) from public, anon;
revoke all on function public.tt_claim_push_changes(uuid) from public, anon;
grant usage on schema tt_private to service_role;
grant execute on function tt_private.claim_push_changes(uuid), public.tt_claim_push_changes(uuid)
  to authenticated, service_role;

create function tt_private.finish_push_change(p_family uuid, p_event uuid, p_success boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare pending tt_private.push_changes%rowtype;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    if auth.uid() is null or not exists (
      select 1 from public.tt_family_members m
      where m.family_id = p_family and m.user_id = auth.uid() and m.role = 'parent'
    ) then raise exception 'TT_PUSH: 가족 관리자 권한이 필요해요'; end if;
  end if;
  select * into pending from tt_private.push_changes where family_id = p_family for update;
  if not found or pending.lease_event is distinct from p_event then return false; end if;
  if p_success and pending.event_id = p_event then
    delete from tt_private.push_changes where family_id = p_family;
  else
    update tt_private.push_changes set lease_event = null, lease_until = null,
      retry_after = case when event_id <> p_event then now()
        else now() + make_interval(secs => least(3600, 30 * power(2, least(attempts, 7))::integer)) end
    where family_id = p_family;
  end if;
  return true;
end;
$$;
create function public.tt_finish_push_change(p_family uuid, p_event uuid, p_success boolean)
returns boolean language sql security invoker set search_path = '' as $$
  select tt_private.finish_push_change(p_family, p_event, p_success);
$$;
revoke all on function tt_private.finish_push_change(uuid, uuid, boolean) from public, anon;
revoke all on function public.tt_finish_push_change(uuid, uuid, boolean) from public, anon;
grant execute on function tt_private.finish_push_change(uuid, uuid, boolean),
  public.tt_finish_push_change(uuid, uuid, boolean) to authenticated, service_role;

-- Expo 접수와 FCM 전달 결과를 구분해 보관한다. 클라이언트에서 직접 읽지 못한다.
create table tt_private.push_receipts (
  ticket_id text primary key,
  family_id uuid not null references public.tt_families(id) on delete cascade,
  device_id uuid not null references public.tt_devices(id) on delete cascade,
  push_token text not null,
  event_id uuid not null,
  issued_at timestamptz not null default now(),
  check_after timestamptz not null default now() + interval '15 minutes'
);
alter table tt_private.push_receipts enable row level security;
revoke all on tt_private.push_receipts from public, anon, authenticated;
create index push_receipts_due_idx on tt_private.push_receipts(check_after);
create index push_receipts_family_idx on tt_private.push_receipts(family_id);
create index push_receipts_device_idx on tt_private.push_receipts(device_id);

create function tt_private.record_push_tickets(p_family uuid, p_event uuid, p_tickets jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare ticket jsonb; target_device public.tt_devices%rowtype;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    if auth.uid() is null or not exists (
      select 1 from public.tt_family_members m where m.family_id = p_family
        and m.user_id = auth.uid() and m.role = 'parent'
    ) then raise exception 'TT_PUSH: 가족 관리자 권한이 필요해요'; end if;
  end if;
  if jsonb_typeof(p_tickets) <> 'array' or jsonb_array_length(p_tickets) > 100 then
    raise exception 'TT_PUSH: 잘못된 발송 결과';
  end if;
  if not exists(select 1 from tt_private.push_changes where family_id = p_family and lease_event = p_event) then
    raise exception 'TT_PUSH: 발송 임대가 없어요';
  end if;
  for ticket in select value from jsonb_array_elements(p_tickets) loop
    select d.* into target_device from public.tt_devices d
    join public.tt_family_members m on m.family_id = d.family_id and m.user_id = d.user_id and m.role = 'child'
    where d.family_id = p_family and d.id = (ticket->>'deviceId')::uuid
      and d.push_token = ticket->>'token' for update of d;
    -- 발송 중 토큰이 바뀌면 새 토큰을 정리하지 않는다.
    if not found then continue; end if;
    if ticket->>'error' = 'DeviceNotRegistered' then
      update public.tt_devices set push_token = null where id = target_device.id;
    elsif ticket->>'ticketId' ~ '^[0-9a-fA-F-]{36}$' then
      insert into tt_private.push_receipts(ticket_id, family_id, device_id, push_token, event_id)
      values(ticket->>'ticketId', p_family, target_device.id, target_device.push_token, p_event)
      on conflict(ticket_id) do nothing;
    end if;
  end loop;
end;
$$;
create function public.tt_record_push_tickets(p_family uuid, p_event uuid, p_tickets jsonb)
returns void language sql security invoker set search_path = '' as $$
  select tt_private.record_push_tickets(p_family, p_event, p_tickets);
$$;
revoke all on function tt_private.record_push_tickets(uuid, uuid, jsonb) from public, anon;
revoke all on function public.tt_record_push_tickets(uuid, uuid, jsonb) from public, anon;
grant execute on function tt_private.record_push_tickets(uuid, uuid, jsonb),
  public.tt_record_push_tickets(uuid, uuid, jsonb) to authenticated, service_role;

create function tt_private.claim_push_receipts(p_family uuid)
returns table(ticket_id text, expired boolean) language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    if auth.uid() is null or p_family is null or not exists (
      select 1 from public.tt_family_members m where m.family_id = p_family
        and m.user_id = auth.uid() and m.role = 'parent'
    ) then raise exception 'TT_PUSH: 가족 관리자 권한이 필요해요'; end if;
  end if;
  return query with due as (
    select r.ticket_id from tt_private.push_receipts r
    where (p_family is null or r.family_id = p_family) and r.check_after <= now()
    order by r.check_after limit 100 for update skip locked
  ) update tt_private.push_receipts r set check_after = now() + interval '5 minutes'
    from due where r.ticket_id = due.ticket_id returning r.ticket_id, r.issued_at < now() - interval '24 hours';
end;
$$;
create function public.tt_claim_push_receipts(p_family uuid default null)
returns table(ticket_id text, expired boolean) language sql security invoker set search_path = '' as $$
  select * from tt_private.claim_push_receipts(p_family);
$$;
revoke all on function tt_private.claim_push_receipts(uuid), public.tt_claim_push_receipts(uuid) from public, anon;
grant execute on function tt_private.claim_push_receipts(uuid), public.tt_claim_push_receipts(uuid)
  to authenticated, service_role;

create function tt_private.finish_push_receipt(p_ticket text, p_status text, p_error text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare receipt tt_private.push_receipts%rowtype;
begin
  select * into receipt from tt_private.push_receipts where ticket_id = p_ticket for update;
  if not found then return false; end if;
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    if auth.uid() is null or not exists (
      select 1 from public.tt_family_members m where m.family_id = receipt.family_id
        and m.user_id = auth.uid() and m.role = 'parent'
    ) then raise exception 'TT_PUSH: 가족 관리자 권한이 필요해요'; end if;
  end if;
  if p_status is null or p_status not in ('ok', 'error') then return false; end if;
  if p_status = 'error' and p_error = 'DeviceNotRegistered' then
    update public.tt_devices set push_token = null
    where id = receipt.device_id and family_id = receipt.family_id and push_token = receipt.push_token;
  elsif p_status = 'error' then
    -- 전달 실패는 새 발송을 대기시킨다. 더 최신 변경이 있으면 그것을 유지한다.
    insert into tt_private.push_changes(family_id, retry_after)
    values(receipt.family_id, now() + interval '15 minutes') on conflict(family_id) do nothing;
  end if;
  delete from tt_private.push_receipts where ticket_id = p_ticket;
  return true;
end;
$$;
create function public.tt_finish_push_receipt(p_ticket text, p_status text, p_error text default null)
returns boolean language sql security invoker set search_path = '' as $$
  select tt_private.finish_push_receipt(p_ticket, p_status, p_error);
$$;
revoke all on function tt_private.finish_push_receipt(text, text, text),
  public.tt_finish_push_receipt(text, text, text) from public, anon;
grant execute on function tt_private.finish_push_receipt(text, text, text),
  public.tt_finish_push_receipt(text, text, text) to authenticated, service_role;

create function tt_private.due_push_families()
returns table(family_id uuid) language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'TT_PUSH: 서버 발송 작업자만 조회할 수 있어요';
  end if;
  return query select due.family_id from (
    select q.family_id, q.retry_after as due_at from tt_private.push_changes q
    where q.retry_after <= now() and (q.lease_until is null or q.lease_until <= now())
    union all
    select r.family_id, r.check_after from tt_private.push_receipts r where r.check_after <= now()
  ) due group by due.family_id order by min(due.due_at) limit 3;
end;
$$;
create function public.tt_due_push_families()
returns table(family_id uuid) language sql security invoker set search_path = '' as $$
  select * from tt_private.due_push_families();
$$;
revoke all on function tt_private.due_push_families(), public.tt_due_push_families()
  from public, anon, authenticated;
grant execute on function tt_private.due_push_families(), public.tt_due_push_families() to service_role;
revoke all on function tt_private.enqueue_schedule_change() from public, anon, authenticated;

do $$
declare target_table text;
begin
  foreach target_table in array array[
    'tt_periods', 'tt_timetable_sets', 'tt_timetable_settings',
    'tt_timetable_items', 'tt_day_exceptions', 'tt_tasks'
  ] loop
    execute format(
      'create trigger tt_queue_change after insert or update or delete on public.%I '
      'for each row execute function tt_private.enqueue_schedule_change()', target_table
    );
  end loop;
end;
$$;
