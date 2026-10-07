-- TimeTable 관리자 편집 저장 함수 실행 검증 (백로그 P6.15)
--
-- 가짜 가족(아빠·딸)과 외부인을 만들고 tt_apply_family_edit의 저장·충돌·되살리기 거부·완료 이력 보호·원자성·권한을 확인한다.
-- 전부 한 트랜잭션 안에서 하고 마지막에 결과를 담은 오류를 일부러 내어 모두 되돌린다(가짜 사용자·데이터가 남지 않는다).
-- 실행: npx supabase db query --linked --project-ref <ref> -f supabase/tests/tt_family_edit_check.sql
-- 결과: 오류 메시지의 'TT_EDIT_RESULT' 뒤 JSON. 각 항목은 [검사 이름, 기대, 실제].

begin;

select set_config('tt.r', '[]', true);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000e0001', 'authenticated', 'authenticated', 'tt-edit-dad@example.invalid'),
  ('00000000-0000-4000-8000-0000000e0002', 'authenticated', 'authenticated', 'tt-edit-child@example.invalid'),
  ('00000000-0000-4000-8000-0000000e0003', 'authenticated', 'authenticated', 'tt-edit-outsider@example.invalid');

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
grant execute on function pg_temp.tt_call(text) to authenticated, anon;
grant execute on function pg_temp.tt_rec(text, text, text) to authenticated, anon;
grant execute on function pg_temp.tt_try(text) to authenticated, anon;
do $$ begin execute format('grant usage on schema %I to authenticated, anon', pg_my_temp_schema()::regnamespace::text); end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000e0001","role":"authenticated"}', true);
select set_config('tt.fam', public.tt_create_family('편집 검증 가족', '아빠')::text, true);
insert into public.tt_family_members (family_id, user_id, role, display_name)
  values (current_setting('tt.fam')::uuid, '00000000-0000-4000-8000-0000000e0002', 'child', '딸');

-- 딸 폰에서 세트·적용 세트·항목·할 일을 새로 만든다(폰이 정한 id, 다른 family_id를 보내도 이 가족으로 강제)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000e0002","role":"authenticated"}', true);
select pg_temp.tt_rec('딸: 새로 만들기 저장', 'ok', pg_temp.tt_try(format($q$select public.tt_apply_family_edit(%L, %L::jsonb)$q$, current_setting('tt.fam'), $j${
  "inserts": {
    "tt_timetable_sets": [{"id": 880001, "family_id": "11111111-1111-4111-8111-111111111111", "name": "평소"}],
    "tt_timetable_items": [{"id": 880101, "set_id": 880001, "weekday": 3, "period_no": null, "start_time": "16:00", "end_time": "17:00", "title": "피아노", "category": "academy", "color_key": "music", "icon_key": "music-note", "alert_mode": "none", "alert_before_min": 0, "memo": ""}],
    "tt_tasks": [{"id": 880201, "title": "줄넘기", "repeat_weekdays": [1, 3], "task_date": null, "remind_time": null, "alert_mode": "none", "sticker_reward": null, "effective_from": "2026-10-01", "effective_until": null}]
  },
  "settings": {"active_set_id": 880001}
}$j$)));
select pg_temp.tt_rec('저장 결과(가족 강제·요일 배열·적용 세트)', '피아노|{1,3}|880001',
  (select i.title from public.tt_timetable_items i where i.id = 880101 and i.family_id = current_setting('tt.fam')::uuid)
  || '|' || (select repeat_weekdays::text from public.tt_tasks where id = 880201 and family_id = current_setting('tt.fam')::uuid)
  || '|' || (select active_set_id::text from public.tt_timetable_settings where family_id = current_setting('tt.fam')::uuid));

-- 같은 id로 새로 만들면(다른 기기가 먼저 만든 경우) 덮어쓰지 않고 실패
select pg_temp.tt_call(format($q$select public.tt_apply_family_edit(%L, %L::jsonb)$q$, current_setting('tt.fam'), '{"inserts":{"tt_tasks":[{"id":880201,"title":"덮어쓰기","repeat_weekdays":null,"task_date":"2026-10-08","alert_mode":"none"}]}}'));
select pg_temp.tt_rec('같은 id 새로 만들기는 실패(덮어쓰지 않음)', 'P0001:TT_EDIT: 다른 기기에서 먼저 바꾼 내용이 있어요. 서버와 다시 맞춘 뒤 해 주세요|줄넘기',
  current_setting('tt.last') || '|' || (select title from public.tt_tasks where id = 880201));

-- 고치기는 반영되고, 서버에 없는 행을 고치면 되살리지 않고 실패
select pg_temp.tt_call(format($q$select public.tt_apply_family_edit(%L, %L::jsonb)$q$, current_setting('tt.fam'), '{"updates":{"tt_timetable_items":[{"id":880101,"set_id":880001,"weekday":3,"period_no":null,"start_time":"16:00","end_time":"17:00","title":"피아노 레슨","category":"academy","color_key":"music","icon_key":"music-note","alert_mode":"none","alert_before_min":0,"memo":""}]}}'));
select pg_temp.tt_rec('고치기 반영', 'ok|피아노 레슨', current_setting('tt.last') || '|' || (select title from public.tt_timetable_items where id = 880101));
select pg_temp.tt_call(format($q$select public.tt_apply_family_edit(%L, %L::jsonb)$q$, current_setting('tt.fam'), '{"updates":{"tt_rewards":[{"id":889999,"title":"없는 보상","sticker_goal":5}]}}'));
select pg_temp.tt_rec('지워진 행 고치기는 실패(되살리지 않음)', 'P0001:TT_EDIT: 다른 기기에서 지운 항목이에요. 서버와 다시 맞춘 뒤 해 주세요|0', current_setting('tt.last') || '|' || (select count(*) from public.tt_rewards where id = 889999));

-- 완료 이력이 있는 할 일은 지우지 않는다
insert into public.tt_task_completion_history (family_id, task_id, completion_date) values (current_setting('tt.fam')::uuid, 880201, '2026-10-07');
select pg_temp.tt_call(format($q$select public.tt_apply_family_edit(%L, %L::jsonb)$q$, current_setting('tt.fam'), '{"deletes":{"tt_tasks":[880201]}}'));
select pg_temp.tt_rec('완료 이력 있는 할 일 지우기 거부', 'P0001:TT_EDIT: 완료 기록이 있는 할 일은 지울 수 없어요. 서버와 다시 맞춘 뒤 그만두기로 끝내 주세요|1', current_setting('tt.last') || '|' || (select count(*) from public.tt_tasks where id = 880201));

-- 한 번의 저장은 한 트랜잭션: 뒤쪽이 실패하면 앞에서 지운 항목도 그대로 남는다
select pg_temp.tt_call(format($q$select public.tt_apply_family_edit(%L, %L::jsonb)$q$, current_setting('tt.fam'), '{"deletes":{"tt_timetable_items":[880101]},"updates":{"tt_rewards":[{"id":889998,"title":"x","sticker_goal":1}]}}'));
select pg_temp.tt_rec('중간에 실패하면 아무것도 바뀌지 않음', 'P0001:TT_EDIT: 다른 기기에서 지운 항목이에요. 서버와 다시 맞춘 뒤 해 주세요|1', current_setting('tt.last') || '|' || (select count(*) from public.tt_timetable_items where id = 880101));

-- 반대로 성공하는 지우기는 실제로 지워진다(같은 문장 착시가 아님을 확인)
select pg_temp.tt_call(format($q$select public.tt_apply_family_edit(%L, %L::jsonb)$q$, current_setting('tt.fam'), '{"deletes":{"tt_timetable_items":[880101]}}'));
select pg_temp.tt_rec('지우기 반영', 'ok|0', current_setting('tt.last') || '|' || (select count(*) from public.tt_timetable_items where id = 880101));

-- 다른 가족(외부인)은 이 가족을 바꿀 수 없다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000e0003","role":"authenticated"}', true);
select pg_temp.tt_rec('외부인 거부', 'P0001:TT_EDIT: 이 가족의 데이터를 바꿀 수 없습니다',
  pg_temp.tt_try(format($q$select public.tt_apply_family_edit(%L, %L::jsonb)$q$, current_setting('tt.fam'), '{"deletes":{"tt_timetable_items":[880101]}}')));

reset role;
set local role anon;
select pg_temp.tt_rec('anon: 함수 실행 거부', '42501',
  split_part(pg_temp.tt_try(format('select public.tt_apply_family_edit(%L, %L::jsonb)', current_setting('tt.fam'), '{}')), ':', 1));
reset role;

do $$ begin raise exception 'TT_EDIT_RESULT %', current_setting('tt.r'); end $$;
