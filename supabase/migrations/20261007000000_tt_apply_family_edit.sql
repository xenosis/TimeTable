-- TimeTable 서버: 로그인한 폰의 관리자 편집을 한 트랜잭션으로 저장하는 함수 (백로그 P6.15 리뷰 반영, 2026-10-07)
--
-- 앱은 편집 전후 '가족 데이터' 테이블(교시·시간표 세트·적용 세트·시간표 항목·휴일·할 일·보상 목표)을 비교해 바뀐 행을 보낸다.
--  * 한 번의 호출 = 한 트랜잭션이라, 중간에 실패하면 서버에는 아무것도 바뀌지 않는다(일부만 남지 않음).
--  * security invoker: 호출한 계정의 권한·보안 규칙(RLS)이 그대로 적용된다. 모든 행의 family_id는 p_family로 강제한다.
--  * 새 행(inserts)은 폰이 정한 id로 넣되 덮어쓰지 않는다: 이미 그 id가 있으면(다른 기기가 먼저 만듦) 실패한다.
--  * 고친 행(updates)이 서버에 없으면(다른 기기가 지움) 되살리지 않고 실패한다.
--  * 서버에 완료 이력이 있는 할 일은 지우지 않는다(딸의 기록이 함께 지워지지 않게. 앱 규칙처럼 그만두기로 끝낸다).
--  * 실패 사유는 'TT_EDIT: …' 한글 문구로 돌려준다.
--
-- p_edit 모양: {"deletes": {"tt_tasks": [1,2], ...}, "inserts": {"tt_tasks": [{...}], ...}, "updates": {...}, "settings": {"active_set_id": 3} | null}

create function public.tt_apply_family_edit(p_family uuid, p_edit jsonb) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- 지우기는 참조하는 쪽부터, 넣기·고치기는 참조되는 쪽부터(외래키)
  delete_order text[] := array['tt_timetable_items', 'tt_rewards', 'tt_tasks', 'tt_day_exceptions', 'tt_timetable_sets', 'tt_periods'];
  write_order text[] := array['tt_periods', 'tt_timetable_sets', 'tt_timetable_items', 'tt_day_exceptions', 'tt_tasks', 'tt_rewards'];
  t text;
  r jsonb;
  cols text;
  n integer;
  v_id bigint;
begin
  if p_family is null or p_edit is null or jsonb_typeof(p_edit) <> 'object' then
    raise exception 'TT_EDIT: 잘못된 요청입니다';
  end if;
  if not (select tt_private.is_family_member(p_family)) then
    raise exception 'TT_EDIT: 이 가족의 데이터를 바꿀 수 없습니다';
  end if;
  -- 같은 가족 편집이 동시에 들어와도 하나씩 처리한다
  perform pg_advisory_xact_lock(hashtextextended('tt_apply_family_edit:' || p_family::text, 0));

  foreach t in array delete_order loop
    for v_id in select (jsonb_array_elements_text(coalesce(p_edit -> 'deletes' -> t, '[]'::jsonb)))::bigint loop
      if t = 'tt_tasks' and exists (select 1 from public.tt_task_completion_history h where h.family_id = p_family and h.task_id = v_id) then
        raise exception 'TT_EDIT: 완료 기록이 있는 할 일은 지울 수 없어요. 서버와 다시 맞춘 뒤 그만두기로 끝내 주세요';
      end if;
      execute format('delete from public.%I where family_id = $1 and id = $2', t) using p_family, v_id;
    end loop;
  end loop;

  foreach t in array write_order loop
    for r in select * from jsonb_array_elements(coalesce(p_edit -> 'inserts' -> t, '[]'::jsonb)) loop
      r := r || jsonb_build_object('family_id', p_family);
      select string_agg(format('%I', k), ', ') into cols from jsonb_object_keys(r) k;
      begin
        execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1)', t, cols) using r;
      exception when unique_violation then
        raise exception 'TT_EDIT: 다른 기기에서 먼저 바꾼 내용이 있어요. 서버와 다시 맞춘 뒤 해 주세요';
      end;
    end loop;
    for r in select * from jsonb_array_elements(coalesce(p_edit -> 'updates' -> t, '[]'::jsonb)) loop
      r := r || jsonb_build_object('family_id', p_family);
      select string_agg(format('%I', k), ', ') into cols from jsonb_object_keys(r) k where k not in ('id', 'family_id', 'created_at');
      execute format('update public.%1$I set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1)) where family_id = $2 and id = $3', t, cols)
        using r, p_family, (r ->> 'id')::bigint;
      get diagnostics n = row_count;
      if n = 0 then raise exception 'TT_EDIT: 다른 기기에서 지운 항목이에요. 서버와 다시 맞춘 뒤 해 주세요'; end if;
    end loop;
    -- 적용 세트는 세트를 넣은 다음, 항목보다 먼저 맞춘다
    if t = 'tt_timetable_sets' and jsonb_typeof(p_edit -> 'settings') = 'object' then
      insert into public.tt_timetable_settings (family_id, active_set_id)
        values (p_family, (p_edit -> 'settings' ->> 'active_set_id')::bigint)
        on conflict (family_id) do update set active_set_id = excluded.active_set_id;
    end if;
  end loop;
end;
$$;

revoke execute on function public.tt_apply_family_edit(uuid, jsonb) from public, anon;
grant execute on function public.tt_apply_family_edit(uuid, jsonb) to authenticated;
