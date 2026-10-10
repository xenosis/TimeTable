-- TimeTable 서버: 학교 시간표 자동 갱신용 학교·학년·반 설정을 가족 단위로 저장해 아빠 폰과 딸 폰이 공유한다 (백로그 P8.7, 2026-10-10 사용자 결정)
--
--  * tt_timetable_settings에 학교 칸 5개를 더한다(없으면 null = 아직 정하지 않음). 학년은 1~6, 다섯 칸은 모두 있거나 모두 없다.
--  * tt_apply_family_edit의 적용 세트 저장에 학교 칸을 더한다. 편집 묶음의 settings에 school_code 키가 있을 때만 학교 칸을 바꾼다.
--  * 나머지 동작(가족 확인·잠금·지우기/넣기/고치기 순서·오류 문구)은 20261007000000_tt_apply_family_edit.sql과 같다.

alter table public.tt_timetable_settings
  add column school_office_code text,
  add column school_code text,
  add column school_name text,
  add column school_grade smallint check (school_grade between 1 and 6),
  add column school_class text,
  add constraint tt_timetable_settings_school_all_or_none check (
    (school_office_code is null and school_code is null and school_name is null and school_grade is null and school_class is null)
    or (school_office_code <> '' and school_code <> '' and school_name <> '' and school_grade is not null and school_class <> '')
  );

create or replace function public.tt_apply_family_edit(p_family uuid, p_edit jsonb) returns void
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
      -- 학교 설정(P8.7)은 그 키를 보낸 때만 바꾼다(학교 칸을 모르는 옛 앱이 보낸 편집이 학교 설정을 지우지 않게)
      insert into public.tt_timetable_settings (family_id, active_set_id, school_office_code, school_code, school_name, school_grade, school_class)
        values (p_family, (p_edit -> 'settings' ->> 'active_set_id')::bigint,
          p_edit -> 'settings' ->> 'school_office_code', p_edit -> 'settings' ->> 'school_code', p_edit -> 'settings' ->> 'school_name',
          (p_edit -> 'settings' ->> 'school_grade')::smallint, p_edit -> 'settings' ->> 'school_class')
        on conflict (family_id) do update set
          active_set_id = excluded.active_set_id,
          school_office_code = case when p_edit -> 'settings' ? 'school_code' then excluded.school_office_code else public.tt_timetable_settings.school_office_code end,
          school_code = case when p_edit -> 'settings' ? 'school_code' then excluded.school_code else public.tt_timetable_settings.school_code end,
          school_name = case when p_edit -> 'settings' ? 'school_code' then excluded.school_name else public.tt_timetable_settings.school_name end,
          school_grade = case when p_edit -> 'settings' ? 'school_code' then excluded.school_grade else public.tt_timetable_settings.school_grade end,
          school_class = case when p_edit -> 'settings' ? 'school_code' then excluded.school_class else public.tt_timetable_settings.school_class end;
    end if;
  end loop;
end;
$$;

revoke execute on function public.tt_apply_family_edit(uuid, jsonb) from public, anon;
grant execute on function public.tt_apply_family_edit(uuid, jsonb) to authenticated;
