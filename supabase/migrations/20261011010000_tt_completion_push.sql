-- 완료 푸시는 시간표 변경 큐와 분리한다. 가족별 하루 한 번만 접수한다.
create table tt_private.completion_notices (
  family_id uuid not null references public.tt_families(id) on delete cascade,
  completion_date date not null,
  event_order bigint not null default nextval('tt_private.push_event_order'),
  sent boolean not null default false,
  lease_until timestamptz,
  lease_id uuid,
  retry_after timestamptz not null default now(),
  attempts integer not null default 0,
  primary key (family_id, completion_date)
);
alter table tt_private.completion_notices enable row level security;
revoke all on tt_private.completion_notices from public, anon, authenticated;
create index completion_notices_due_idx on tt_private.completion_notices(retry_after) where not sent;

create table tt_private.completion_receipts (
  ticket_id uuid primary key,
  family_id uuid not null,
  completion_date date not null,
  lease_id uuid not null,
  push_token text not null,
  issued_at timestamptz not null default now(),
  check_after timestamptz not null default now() + interval '15 minutes',
  foreign key (family_id, completion_date) references tt_private.completion_notices(family_id, completion_date) on delete cascade
);
alter table tt_private.completion_receipts enable row level security;
revoke all on tt_private.completion_receipts from public, anon, authenticated;
create index completion_receipts_due_idx on tt_private.completion_receipts(check_after);
create index completion_receipts_family_idx on tt_private.completion_receipts(family_id, completion_date);

create function tt_private.tasks_all_done(p_family uuid, p_date date)
returns boolean language sql stable security definer set search_path = '' as $$
  with applicable as (
    select t.id from public.tt_tasks t where t.family_id = p_family
      and (t.created_at at time zone 'Asia/Seoul')::date <= p_date
      and (t.effective_until is null or t.effective_until >= p_date)
      and (t.task_date = p_date or (
        extract(dow from p_date)::smallint = any(t.repeat_weekdays)
        and coalesce(t.effective_from, (t.created_at at time zone 'Asia/Seoul')::date) <= p_date
      ))
  )
  select exists(select 1 from applicable) and not exists (
    select 1 from applicable a where not exists (
      select 1 from public.tt_task_completions c
      where c.family_id = p_family and c.task_id = a.id and c.completion_date = p_date
    )
  );
$$;
revoke all on function tt_private.tasks_all_done(uuid, date) from public, anon, authenticated;

create function tt_private.enqueue_completion_notice()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- 이전 날짜의 기록 복원이나 아빠의 체크로 오늘 완료 푸시를 만들지 않는다.
  if new.done_by = 'child' and new.completion_date = (now() at time zone 'Asia/Seoul')::date
    and tt_private.tasks_all_done(new.family_id, new.completion_date) then
    insert into tt_private.completion_notices(family_id, completion_date)
    values(new.family_id, new.completion_date) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function tt_private.enqueue_completion_notice() from public, anon, authenticated;
create trigger tt_queue_completion after insert or update on public.tt_task_completions
for each row execute function tt_private.enqueue_completion_notice();

-- 서버 작업자만 현재의 전체 완료 상태를 재확인하고 발송 임대를 얻는다.
create function public.tt_claim_completion_notices()
returns table(family_id uuid, completion_date date, event_order bigint, lease_id uuid, tokens jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'TT_PUSH: 서버 발송 작업자만 조회할 수 있어요';
  end if;
  return query with due as (
    select q.family_id, q.completion_date from tt_private.completion_notices q
    where not q.sent and q.completion_date = (now() at time zone 'Asia/Seoul')::date
      and q.retry_after <= now() and (q.lease_until is null or q.lease_until <= now())
      and tt_private.tasks_all_done(q.family_id, q.completion_date)
    order by q.retry_after limit 3 for update skip locked
  ), claimed as (
    update tt_private.completion_notices q set lease_until = now() + interval '2 minutes', lease_id = gen_random_uuid(), attempts = q.attempts + 1
    from due where q.family_id = due.family_id and q.completion_date = due.completion_date
    returning q.family_id, q.completion_date, q.event_order, q.lease_id
  ) select c.family_id, c.completion_date, c.event_order, c.lease_id, coalesce((
    select jsonb_agg(distinct d.push_token) from public.tt_devices d
    join public.tt_family_members m on m.family_id = d.family_id and m.user_id = d.user_id and m.role = 'parent'
    where d.family_id = c.family_id and d.push_token is not null
  ), '[]'::jsonb) from claimed c;
end;
$$;
revoke all on function public.tt_claim_completion_notices() from public, anon, authenticated;
grant execute on function public.tt_claim_completion_notices() to service_role;

create function public.tt_finish_completion_notice(p_family uuid, p_date date, p_order bigint, p_lease uuid, p_success boolean, p_tickets jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare notice tt_private.completion_notices%rowtype; ticket jsonb;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'TT_PUSH: 서버 발송 작업자만 처리할 수 있어요';
  end if;
  if p_tickets is null or jsonb_typeof(p_tickets) <> 'array' or jsonb_array_length(p_tickets) > 1000 then
    raise exception 'TT_PUSH: 잘못된 토큰 처리 정보';
  end if;
  select * into notice from tt_private.completion_notices q
    where q.family_id = p_family and q.completion_date = p_date for update;
  if not found or notice.event_order <> p_order or notice.lease_id is distinct from p_lease or notice.lease_until is null then return false; end if;
  for ticket in select value from jsonb_array_elements(p_tickets) loop
    if ticket->>'error' = 'DeviceNotRegistered' then
      -- 이전 토큰의 결과로 새 토큰이나 다른 가족·딸 토큰을 지우지 않는다.
      update public.tt_devices d set push_token = null
        where d.family_id = p_family and d.push_token = ticket->>'token'
          and exists(select 1 from public.tt_family_members m where m.family_id = d.family_id and m.user_id = d.user_id and m.role = 'parent');
    elsif ticket->>'ticketId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      insert into tt_private.completion_receipts(ticket_id,family_id,completion_date,lease_id,push_token)
      values((ticket->>'ticketId')::uuid,p_family,p_date,p_lease,ticket->>'token') on conflict do nothing;
    end if;
  end loop;
  update tt_private.completion_notices q set sent = coalesce(p_success, false), lease_until = null,
    retry_after = now() + make_interval(secs => least(3600, 30 * power(2, least(notice.attempts, 7))::integer))
    where q.family_id = p_family and q.completion_date = p_date;
  return true;
end;
$$;
revoke all on function public.tt_finish_completion_notice(uuid, date, bigint, uuid, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.tt_finish_completion_notice(uuid, date, bigint, uuid, boolean, jsonb) to service_role;

create function public.tt_claim_completion_receipts()
returns table(ticket_id text, expired boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then raise exception 'TT_PUSH: 서버 작업자 권한이 필요해요'; end if;
  return query with due as (
    select r.ticket_id from tt_private.completion_receipts r where r.check_after <= now()
    order by r.check_after limit 100 for update skip locked
  ) update tt_private.completion_receipts r set check_after = now() + interval '5 minutes'
    from due where r.ticket_id = due.ticket_id
    returning r.ticket_id::text, r.issued_at < now() - interval '24 hours';
end;
$$;
revoke all on function public.tt_claim_completion_receipts() from public, anon, authenticated;
grant execute on function public.tt_claim_completion_receipts() to service_role;

create function public.tt_finish_completion_receipt(p_ticket text, p_status text, p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare receipt tt_private.completion_receipts%rowtype;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then raise exception 'TT_PUSH: 서버 작업자 권한이 필요해요'; end if;
  if p_status is null or p_status not in ('ok','error') then return false; end if;
  if p_ticket is null or p_ticket !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return false; end if;
  select * into receipt from tt_private.completion_receipts r where r.ticket_id = p_ticket::uuid for update;
  if not found then return false; end if;
  if p_status = 'error' then
    if p_error = 'DeviceNotRegistered' then
      update public.tt_devices d set push_token = null
        where d.family_id = receipt.family_id and d.push_token = receipt.push_token
          and exists(select 1 from public.tt_family_members m where m.family_id=d.family_id and m.user_id=d.user_id and m.role='parent');
    end if;
    -- 이전 시도의 실패가 이후 성공 접수 상태를 덮어쓰지 않는다.
    update tt_private.completion_notices q set sent=false, retry_after=now()+interval '15 minutes'
      where q.family_id=receipt.family_id and q.completion_date=receipt.completion_date
        and q.lease_id=receipt.lease_id;
  end if;
  delete from tt_private.completion_receipts where ticket_id=receipt.ticket_id;
  return true;
end;
$$;
revoke all on function public.tt_finish_completion_receipt(text,text,text) from public,anon,authenticated;
grant execute on function public.tt_finish_completion_receipt(text,text,text) to service_role;
