-- TimeTable 행 수준 보안(RLS) 정책 (백로그 P6.3)
--
-- 권한 모델 (사용자 결정 2026-10-01, D7: 딸 폰 PIN은 로컬 화면 잠금일 뿐이라 서버는 PIN을 확인하지 않는다)
--  * 같은 가족 구성원(아빠 parent, 딸 기기 child)은 시간표·할 일·완료·보석·보상 데이터를 읽고 쓸 수 있다.
--    딸 폰에서 PIN을 통과하면 시간표와 할 일을 고칠 수 있어야 하고, 완료 체크와 보석 적립은 앱이 직접 기록하기 때문이다.
--    (딸 기기의 로그인 정보만 있으면 서버 데이터를 고칠 수 있다는 점을 받아들인 설계다.)
--  * 가족 정보 수정과 구성원 추가·삭제는 아빠만 할 수 있다.
--  * 기기 정보(푸시 토큰, 마지막 동기화 시각)는 본인 것만 쓰고, 아빠는 가족 기기를 읽을 수 있다.
--  * 가족 만들기는 직접 insert가 아니라 tt_create_family()로만 한다(처음 구성원을 아빠로 함께 만든다).
--  * 로그인하지 않은 사용자(anon)에게는 아무 권한도 주지 않는다.

-- ---------------------------------------------------------------------------
-- 소속·역할 확인 함수
-- security definer라서 tt_family_members의 RLS를 거치지 않고 조회한다(정책 안에서 자기 자신을 조회하는 순환을 피한다).
-- 호출한 사용자 본인 소속만 확인하므로 다른 가족의 정보는 알 수 없다. search_path를 비워 둔다.
-- ---------------------------------------------------------------------------

create function tt_private.is_family_member(p_family uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tt_family_members m
    where m.family_id = p_family and m.user_id = (select auth.uid())
  );
$$;

create function tt_private.is_family_parent(p_family uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tt_family_members m
    where m.family_id = p_family and m.user_id = (select auth.uid()) and m.role = 'parent'
  );
$$;

revoke execute on function tt_private.is_family_member(uuid) from public, anon;
revoke execute on function tt_private.is_family_parent(uuid) from public, anon;
grant execute on function tt_private.is_family_member(uuid) to authenticated;
grant execute on function tt_private.is_family_parent(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 가족 만들기: 로그인한 아빠가 한 번 호출한다. 가족과 첫 구성원(parent)을 함께 만든다.
-- ---------------------------------------------------------------------------

create function public.tt_create_family(p_name text, p_display_name text default '') returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_family uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from public.tt_family_members where user_id = v_user) then
    raise exception 'already in a family' using errcode = '23505';
  end if;
  insert into public.tt_families (name) values (p_name) returning id into v_family;
  insert into public.tt_family_members (family_id, user_id, role, display_name)
    values (v_family, v_user, 'parent', coalesce(p_display_name, ''));
  return v_family;
end;
$$;

revoke execute on function public.tt_create_family(text, text) from public, anon;
grant execute on function public.tt_create_family(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 가족 / 구성원 / 기기
-- (force row level security는 쓰지 않는다: 소유자 권한으로 도는 확인 함수와 tt_create_family가 정책에 막힐 수 있다)
-- ---------------------------------------------------------------------------

alter table public.tt_families enable row level security;
alter table public.tt_family_members enable row level security;
alter table public.tt_devices enable row level security;

create policy tt_families_select on public.tt_families
  for select to authenticated
  using ((select tt_private.is_family_member(id)));
create policy tt_families_update on public.tt_families
  for update to authenticated
  using ((select tt_private.is_family_parent(id)))
  with check ((select tt_private.is_family_parent(id)));
create policy tt_families_delete on public.tt_families
  for delete to authenticated
  using ((select tt_private.is_family_parent(id)));

create policy tt_family_members_select on public.tt_family_members
  for select to authenticated
  using ((select tt_private.is_family_member(family_id)));
create policy tt_family_members_insert on public.tt_family_members
  for insert to authenticated
  with check ((select tt_private.is_family_parent(family_id)));
create policy tt_family_members_update on public.tt_family_members
  for update to authenticated
  using ((select tt_private.is_family_parent(family_id)))
  with check ((select tt_private.is_family_parent(family_id)));
create policy tt_family_members_delete on public.tt_family_members
  for delete to authenticated
  using ((select tt_private.is_family_parent(family_id)));

create policy tt_devices_select on public.tt_devices
  for select to authenticated
  using (user_id = (select auth.uid()) or (select tt_private.is_family_parent(family_id)));
create policy tt_devices_insert on public.tt_devices
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select tt_private.is_family_member(family_id)));
create policy tt_devices_update on public.tt_devices
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select tt_private.is_family_member(family_id)));
create policy tt_devices_delete on public.tt_devices
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select tt_private.is_family_parent(family_id)));

-- ---------------------------------------------------------------------------
-- 가족 데이터: 같은 가족 구성원이면 읽기·쓰기
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'tt_periods', 'tt_timetable_sets', 'tt_timetable_settings', 'tt_timetable_items',
    'tt_day_exceptions', 'tt_tasks', 'tt_task_completions', 'tt_task_completion_history',
    'tt_sticker_ledger', 'tt_rewards'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select tt_private.is_family_member(family_id))) with check ((select tt_private.is_family_member(family_id)))',
      t || '_family_members', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 테이블 권한(Data API 노출). Supabase는 2026-10-30부터 기존 프로젝트에서도 public의 새 테이블을 API에 자동 노출하지 않으므로
-- (changelog 45329) 로그인한 사용자와 service_role에 직접 권한을 준다. 행 범위는 위 RLS 정책이 정한다.
-- 로그인하지 않은 사용자(anon)는 테이블 권한 자체를 회수하고, authenticated에서는 TRUNCATE 등 불필요한 권한을 회수한다(최소 권한).
-- Doro와 같은 프로젝트를 쓰므로 tt_ 테이블과 그 id 시퀀스에만 적용한다(스키마 전체 grant를 쓰지 않는다).
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  s text;
begin
  foreach t in array array[
    'tt_families', 'tt_family_members', 'tt_devices',
    'tt_periods', 'tt_timetable_sets', 'tt_timetable_settings', 'tt_timetable_items',
    'tt_day_exceptions', 'tt_tasks', 'tt_task_completions', 'tt_task_completion_history',
    'tt_sticker_ledger', 'tt_rewards'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'id') then
      s := pg_get_serial_sequence(format('public.%I', t), 'id');
      if s is not null then
        execute format('grant usage, select on sequence %s to authenticated, service_role', s);
      end if;
    end if;
  end loop;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'tt_families', 'tt_family_members', 'tt_devices',
    'tt_periods', 'tt_timetable_sets', 'tt_timetable_settings', 'tt_timetable_items',
    'tt_day_exceptions', 'tt_tasks', 'tt_task_completions', 'tt_task_completion_history',
    'tt_sticker_ledger', 'tt_rewards'
  ] loop
    execute format('revoke all on public.%I from anon', t);
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'id')
       and pg_get_serial_sequence(format('public.%I', t), 'id') is not null then
      execute format('revoke all on sequence %s from anon', pg_get_serial_sequence(format('public.%I', t), 'id'));
    end if;
    -- 로그인한 사용자도 행 단위 규칙을 거치지 않는 TRUNCATE와 외래키·트리거 생성 권한은 필요 없다
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t);
  end loop;
end;
$$;
