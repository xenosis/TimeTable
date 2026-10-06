-- TimeTable 서버: 로컬 데이터 이전 함수 보완 (백로그 P6.5 리뷰 반영, 2026-10-06)
--  * 호출자가 이 가족의 딸(child)일 때만 이전하고, 원장·보석 자격의 child_id는 호출자로 정한다(첫 child를 고르던 방식 대체).
--  * 같은 가족에 대한 동시 호출을 트랜잭션 잠금(pg_advisory_xact_lock)으로 하나씩 처리한다.
-- 함수 본문의 나머지(변환·id 다시 붙이기·중복 거부)는 20261006000000과 같다. 권한(authenticated만 실행)은 create or replace로 유지된다.

create or replace function public.tt_import_local(p_family uuid, p_payload jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_child uuid;
  r jsonb;
  v_id bigint;
  v_sets jsonb := '{}'::jsonb;
  v_tasks jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  n integer;
begin
  if p_family is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'TT_IMPORT: 잘못된 요청입니다';
  end if;
  -- 같은 가족에 대한 이전이 동시에 두 번 들어와도 하나씩 처리한다(두 번째는 아래 '이미 데이터 있음'에서 멈춘다)
  perform pg_advisory_xact_lock(hashtextextended('tt_import_local:' || p_family::text, 0));
  -- 이 가족의 딸 계정으로 로그인한 사람만 올릴 수 있고, 올린 딸이 원장·보석 자격의 주인이 된다
  -- (구성원이 아니면 RLS 때문에 자기 행이 보이지 않아 여기서 멈춘다)
  select m.user_id into v_child from public.tt_family_members m
    where m.family_id = p_family and m.user_id = (select auth.uid()) and m.role = 'child';
  if v_child is null then raise exception 'TT_IMPORT: 이 가족의 딸 계정으로만 올릴 수 있습니다'; end if;
  if exists (select 1 from public.tt_periods where family_id = p_family)
     or exists (select 1 from public.tt_timetable_sets where family_id = p_family)
     or exists (select 1 from public.tt_tasks where family_id = p_family)
     or exists (select 1 from public.tt_sticker_ledger where family_id = p_family)
     or exists (select 1 from public.tt_rewards where family_id = p_family)
     or exists (select 1 from public.tt_day_exceptions where family_id = p_family)
     or exists (select 1 from public.tt_gem_rights where family_id = p_family) then
    raise exception 'TT_IMPORT: 서버에 이미 이 가족의 데이터가 있습니다';
  end if;

  n := 0;
  for r in select * from jsonb_array_elements(coalesce(p_payload -> 'periods', '[]'::jsonb)) loop
    insert into public.tt_periods (family_id, period_no, start_time, end_time, created_at)
      values (p_family, (r ->> 'period_no')::integer, r ->> 'start_time', r ->> 'end_time', coalesce(tt_private.import_ts(r ->> 'created_at'), now()));
    n := n + 1;
  end loop;
  v_counts := v_counts || jsonb_build_object('periods', n);

  n := 0;
  for r in select * from jsonb_array_elements(coalesce(p_payload -> 'timetable_sets', '[]'::jsonb)) loop
    insert into public.tt_timetable_sets (family_id, name, created_at)
      values (p_family, r ->> 'name', coalesce(tt_private.import_ts(r ->> 'created_at'), now()))
      returning id into v_id;
    v_sets := v_sets || jsonb_build_object(r ->> 'id', v_id);
    n := n + 1;
  end loop;
  v_counts := v_counts || jsonb_build_object('timetable_sets', n);

  r := p_payload -> 'timetable_settings';
  if r is not null and jsonb_typeof(r) = 'object' then
    insert into public.tt_timetable_settings (family_id, active_set_id)
      values (p_family, (v_sets ->> (r ->> 'active_set_id'))::bigint);
    v_counts := v_counts || jsonb_build_object('timetable_settings', 1);
  end if;

  n := 0;
  for r in select * from jsonb_array_elements(coalesce(p_payload -> 'timetable_items', '[]'::jsonb)) loop
    if v_sets ->> (r ->> 'set_id') is null then raise exception 'TT_IMPORT: 세트가 없는 시간표 항목이 있습니다'; end if;
    insert into public.tt_timetable_items (family_id, set_id, weekday, period_no, start_time, end_time, title, category,
        color_key, icon_key, alert_mode, alert_before_min, memo, created_at)
      values (p_family, (v_sets ->> (r ->> 'set_id'))::bigint, (r ->> 'weekday')::smallint, (r ->> 'period_no')::integer,
        r ->> 'start_time', r ->> 'end_time', r ->> 'title', r ->> 'category', r ->> 'color_key', r ->> 'icon_key',
        coalesce(r ->> 'alert_mode', 'none'), coalesce((r ->> 'alert_before_min')::integer, 0), coalesce(r ->> 'memo', ''),
        coalesce(tt_private.import_ts(r ->> 'created_at'), now()));
    n := n + 1;
  end loop;
  v_counts := v_counts || jsonb_build_object('timetable_items', n);

  n := 0;
  for r in select * from jsonb_array_elements(coalesce(p_payload -> 'day_exceptions', '[]'::jsonb)) loop
    insert into public.tt_day_exceptions (family_id, start_date, end_date, type, note)
      values (p_family, (r ->> 'start_date')::date, (r ->> 'end_date')::date, r ->> 'type', coalesce(r ->> 'note', ''));
    n := n + 1;
  end loop;
  v_counts := v_counts || jsonb_build_object('day_exceptions', n);

  n := 0;
  for r in select * from jsonb_array_elements(coalesce(p_payload -> 'tasks', '[]'::jsonb)) loop
    insert into public.tt_tasks (family_id, title, repeat_weekdays, task_date, remind_time, alert_mode, sticker_reward,
        effective_from, effective_until, created_at)
      values (p_family, r ->> 'title',
        case when nullif(btrim(r ->> 'repeat_weekdays'), '') is null then null
             else string_to_array(btrim(r ->> 'repeat_weekdays'), ',')::smallint[] end,
        (r ->> 'task_date')::date, nullif(r ->> 'remind_time', ''), coalesce(r ->> 'alert_mode', 'none'),
        (r ->> 'sticker_reward')::integer, (r ->> 'effective_from')::date, (r ->> 'effective_until')::date,
        coalesce(tt_private.import_ts(r ->> 'created_at'), now()))
      returning id into v_id;
    v_tasks := v_tasks || jsonb_build_object(r ->> 'id', v_id);
    n := n + 1;
  end loop;
  v_counts := v_counts || jsonb_build_object('tasks', n);

  n := 0;
  for r in select * from jsonb_array_elements(coalesce(p_payload -> 'task_completions', '[]'::jsonb)) loop
    if v_tasks ->> (r ->> 'task_id') is null then raise exception 'TT_IMPORT: 할 일이 없는 완료 기록이 있습니다'; end if;
    insert into public.tt_task_completions (family_id, task_id, completion_date, done_at, done_by)
      values (p_family, (v_tasks ->> (r ->> 'task_id'))::bigint, (r ->> 'completion_date')::date,
        coalesce(tt_private.import_ts(r ->> 'done_at'), now()), coalesce(r ->> 'done_by', 'child'));
    n := n + 1;
  end loop;
  v_counts := v_counts || jsonb_build_object('task_completions', n);

  n := 0;
  for r in select * from jsonb_array_elements(coalesce(p_payload -> 'task_completion_history', '[]'::jsonb)) loop
    if v_tasks ->> (r ->> 'task_id') is null then raise exception 'TT_IMPORT: 할 일이 없는 완료 이력이 있습니다'; end if;
    insert into public.tt_task_completion_history (family_id, task_id, completion_date)
      values (p_family, (v_tasks ->> (r ->> 'task_id'))::bigint, (r ->> 'completion_date')::date);
    n := n + 1;
  end loop;
  v_counts := v_counts || jsonb_build_object('task_completion_history', n);

  n := 0;
  for r in select * from jsonb_array_elements(coalesce(p_payload -> 'sticker_ledger', '[]'::jsonb)) loop
    -- 지워진 할 일을 가리키던 행은 로컬처럼 task_id를 비운다
    insert into public.tt_sticker_ledger (family_id, child_id, delta, reason, task_id, created_at)
      values (p_family, v_child, (r ->> 'delta')::integer, r ->> 'reason', (v_tasks ->> (r ->> 'task_id'))::bigint,
        coalesce(tt_private.import_ts(r ->> 'created_at'), now()));
    n := n + 1;
  end loop;
  v_counts := v_counts || jsonb_build_object('sticker_ledger', n);

  n := 0;
  for r in select * from jsonb_array_elements(coalesce(p_payload -> 'rewards', '[]'::jsonb)) loop
    insert into public.tt_rewards (family_id, title, sticker_goal, achieved_at)
      values (p_family, r ->> 'title', (r ->> 'sticker_goal')::integer, tt_private.import_ts(r ->> 'achieved_at'));
    n := n + 1;
  end loop;
  v_counts := v_counts || jsonb_build_object('rewards', n);

  n := 0;
  for r in select * from jsonb_array_elements(coalesce(p_payload -> 'gem_rights', '[]'::jsonb)) loop
    insert into public.tt_gem_rights (family_id, child_id, earned_date, state, requested_at, given_at, created_at)
      values (p_family, v_child, (r ->> 'earned_date')::date, coalesce(r ->> 'state', 'available'),
        tt_private.import_ts(r ->> 'requested_at'), tt_private.import_ts(r ->> 'given_at'),
        coalesce(tt_private.import_ts(r ->> 'created_at'), now()));
    n := n + 1;
  end loop;
  v_counts := v_counts || jsonb_build_object('gem_rights', n);

  return v_counts;
end;
$$;
