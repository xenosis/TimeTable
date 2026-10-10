-- TimeTable 학교 설정 공유 검증 (백로그 P8.7, 20261010000000_tt_school_profile.sql 적용 후)
--
-- 가짜 가족(아빠·딸)을 만들고 tt_apply_family_edit의 settings로 학교·학년·반을 저장·유지·지우기·거부하는지 확인한다.
-- 전부 한 트랜잭션 안에서 하고 마지막에 결과를 담은 오류를 일부러 내어 모두 되돌린다(가짜 사용자·데이터가 남지 않는다).
-- 실행: npx supabase db query --linked --project-ref <ref> -f supabase/tests/tt_school_profile_check.sql
-- 결과: 오류 메시지의 'TT_SCHOOL_RESULT' 뒤 JSON. 각 항목은 [검사 이름, 기대, 실제].

begin;

select set_config('tt.r', '[]', true);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000f0001', 'authenticated', 'authenticated', 'tt-school-dad@example.invalid'),
  ('00000000-0000-4000-8000-0000000f0002', 'authenticated', 'authenticated', 'tt-school-child@example.invalid');

create function pg_temp.tt_rec(p_name text, p_expected text, p_actual text) returns void
language sql as $$
  select set_config('tt.r', (current_setting('tt.r')::jsonb || jsonb_build_array(jsonb_build_array(p_name, p_expected, coalesce(p_actual, 'null'))))::text, true);
$$;
create function pg_temp.tt_try(p_sql text) returns text
language plpgsql security invoker as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ':' || sqlerrm;
end;
$$;
-- 함수 호출 결과를 담아 두었다가 다음 문장에서 확인값과 함께 기록한다(같은 문장 안에서는 함수가 바꾼 데이터가 보이지 않는다)
create function pg_temp.tt_call(p_sql text) returns void
language plpgsql security invoker as $$
begin
  perform set_config('tt.last', pg_temp.tt_try(p_sql), true);
end;
$$;
create function pg_temp.tt_school() returns text
language sql security invoker as $$
  select coalesce(school_office_code, '-') || '/' || coalesce(school_code, '-') || '/' || coalesce(school_name, '-') || '/'
    || coalesce(school_grade::text, '-') || '/' || coalesce(school_class, '-') || '/' || coalesce(active_set_id::text, '-')
  from public.tt_timetable_settings where family_id = current_setting('tt.fam')::uuid;
$$;
grant execute on function pg_temp.tt_call(text) to authenticated;
grant execute on function pg_temp.tt_rec(text, text, text) to authenticated;
grant execute on function pg_temp.tt_try(text) to authenticated;
grant execute on function pg_temp.tt_school() to authenticated;
do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace::text); end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000f0001","role":"authenticated"}', true);
select set_config('tt.fam', public.tt_create_family('학교 설정 검증 가족', '아빠')::text, true);
insert into public.tt_family_members (family_id, user_id, role, display_name)
  values (current_setting('tt.fam')::uuid, '00000000-0000-4000-8000-0000000f0002', 'child', '딸');

-- 아빠 폰: 세트를 만들며 적용 세트와 학교 설정을 함께 저장
select pg_temp.tt_call(format($q$select public.tt_apply_family_edit(%L, %L::jsonb)$q$, current_setting('tt.fam'), '{
  "inserts": {"tt_timetable_sets": [{"id": 890001, "name": "평소"}]},
  "settings": {"active_set_id": 890001, "school_office_code": "J10", "school_code": "7591095", "school_name": "빛가온초등학교", "school_grade": 2, "school_class": "6"}
}'));
select pg_temp.tt_rec('아빠: 학교 설정 저장', 'ok|J10/7591095/빛가온초등학교/2/6/890001', current_setting('tt.last') || '|' || pg_temp.tt_school());

-- 학교 칸을 모르는 옛 앱의 편집(적용 세트만)은 학교 설정을 지우지 않는다
select pg_temp.tt_call(format($q$select public.tt_apply_family_edit(%L, %L::jsonb)$q$, current_setting('tt.fam'), '{"settings": {"active_set_id": null}}'));
select pg_temp.tt_rec('옛 앱 편집은 학교 설정 유지', 'ok|J10/7591095/빛가온초등학교/2/6/-', current_setting('tt.last') || '|' || pg_temp.tt_school());

-- 딸 폰(가족 구성원)도 바꿀 수 있다: 반만 바꾼다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000f0002","role":"authenticated"}', true);
select pg_temp.tt_call(format($q$select public.tt_apply_family_edit(%L, %L::jsonb)$q$, current_setting('tt.fam'), '{
  "settings": {"active_set_id": 890001, "school_office_code": "J10", "school_code": "7591095", "school_name": "빛가온초등학교", "school_grade": 2, "school_class": "7"}
}'));
select pg_temp.tt_rec('딸: 반 바꾸기', 'ok|J10/7591095/빛가온초등학교/2/7/890001', current_setting('tt.last') || '|' || pg_temp.tt_school());

-- 학교 칸이 일부만 있거나 학년이 1~6 밖이면 거부하고 그대로 둔다
select pg_temp.tt_call(format($q$select public.tt_apply_family_edit(%L, %L::jsonb)$q$, current_setting('tt.fam'), '{
  "settings": {"active_set_id": 890001, "school_office_code": "J10", "school_code": "7591095", "school_name": "빛가온초등학교", "school_grade": null, "school_class": "7"}
}'));
select pg_temp.tt_rec('일부만 있으면 거부', '23514|J10/7591095/빛가온초등학교/2/7/890001', split_part(current_setting('tt.last'), ':', 1) || '|' || pg_temp.tt_school());
select pg_temp.tt_call(format($q$select public.tt_apply_family_edit(%L, %L::jsonb)$q$, current_setting('tt.fam'), '{
  "settings": {"active_set_id": 890001, "school_office_code": "J10", "school_code": "7591095", "school_name": "빛가온초등학교", "school_grade": 7, "school_class": "7"}
}'));
select pg_temp.tt_rec('학년 7 거부', '23514|J10/7591095/빛가온초등학교/2/7/890001', split_part(current_setting('tt.last'), ':', 1) || '|' || pg_temp.tt_school());

-- 학교 칸을 모두 null로 보내면 설정을 지운다
select pg_temp.tt_call(format($q$select public.tt_apply_family_edit(%L, %L::jsonb)$q$, current_setting('tt.fam'), '{
  "settings": {"active_set_id": 890001, "school_office_code": null, "school_code": null, "school_name": null, "school_grade": null, "school_class": null}
}'));
select pg_temp.tt_rec('모두 null이면 지우기', 'ok|-/-/-/-/-/890001', current_setting('tt.last') || '|' || pg_temp.tt_school());

reset role;

do $$ begin raise exception 'TT_SCHOOL_RESULT %', current_setting('tt.r'); end $$;
