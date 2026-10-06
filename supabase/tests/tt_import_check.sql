-- TimeTable 로컬 데이터 이전 함수 실행 검증 (백로그 P6.5)
--
-- 가짜 가족(아빠·딸)과 외부인을 만들고, 딸 계정으로 tt_import_local을 불러 로컬 행이 서버 행으로 맞게 옮겨지는지 확인한다.
-- 전부 한 트랜잭션 안에서 하고 마지막에 결과를 담은 오류를 일부러 내어 모두 되돌린다(가짜 사용자·데이터가 남지 않는다).
-- 실행 전 적용: 20261006000000_tt_gem_rights_import.sql이 이미 적용돼 있어야 한다. 적용 전에 검증하려면 마이그레이션 본문을 이 파일 앞에 붙여 같은 트랜잭션에서 실행한다.
-- 실행: npx supabase db query --linked --project-ref <ref> -f supabase/tests/tt_import_check.sql
-- 결과: 오류 메시지의 'TT_IMPORT_RESULT' 뒤 JSON. 각 항목은 [검사 이름, 기대, 실제]. 모든 항목의 기대와 실제가 같아야 통과다.

begin;

select set_config('tt.r', '[]', true);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000d0001', 'authenticated', 'authenticated', 'tt-import-dad@example.invalid'),
  ('00000000-0000-4000-8000-0000000d0002', 'authenticated', 'authenticated', 'tt-import-child@example.invalid'),
  ('00000000-0000-4000-8000-0000000d0003', 'authenticated', 'authenticated', 'tt-import-outsider@example.invalid');

-- [이름, 기대, 실제]를 기록한다
create function pg_temp.tt_rec(p_name text, p_expected text, p_actual text) returns void
language sql as $$
  select set_config('tt.r', (current_setting('tt.r')::jsonb || jsonb_build_array(jsonb_build_array(p_name, p_expected, coalesce(p_actual, 'null'))))::text, true);
$$;
-- 문장을 실행해 오류 메시지(없으면 'ok')를 돌려준다
create function pg_temp.tt_try(p_sql text) returns text
language plpgsql security invoker as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ':' || sqlerrm;
end;
$$;
grant execute on function pg_temp.tt_rec(text, text, text) to authenticated, anon;
grant execute on function pg_temp.tt_try(text) to authenticated, anon;
do $$ begin execute format('grant usage on schema %I to authenticated, anon', pg_my_temp_schema()::regnamespace::text); end $$;

-- 아빠가 가족을 만들고 딸을 넣는다
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000d0001","role":"authenticated"}', true);
select set_config('tt.fam', public.tt_create_family('이전 검증 가족', '아빠')::text, true);
insert into public.tt_family_members (family_id, user_id, role, display_name)
  values (current_setting('tt.fam')::uuid, '00000000-0000-4000-8000-0000000d0002', 'child', '딸');

-- 로컬 앱이 보내는 모양 그대로(로컬 id, SQLite UTC 시각, CSV 요일, 지워진 할 일을 가리키는 원장 행 포함)
select set_config('tt.payload', $j${
  "periods": [{"id": 1, "period_no": 1, "start_time": "09:00", "end_time": "09:40", "created_at": "2026-09-01 00:00:00"},
              {"id": 2, "period_no": 2, "start_time": "09:50", "end_time": "10:30", "created_at": "2026-09-01 00:00:00"}],
  "timetable_sets": [{"id": 5, "name": "평소", "created_at": "2026-09-02 01:00:00"}, {"id": 9, "name": "방학", "created_at": "2026-09-02 01:00:00"}],
  "timetable_settings": {"active_set_id": 9},
  "timetable_items": [
    {"id": 100, "set_id": 5, "weekday": 1, "period_no": 2, "start_time": null, "end_time": null, "title": "수학", "category": "school", "color_key": "math", "icon_key": "number", "alert_mode": "none", "alert_before_min": 0, "memo": "", "created_at": "2026-09-03 02:00:00"},
    {"id": 101, "set_id": 9, "weekday": 3, "period_no": null, "start_time": "16:00", "end_time": "17:00", "title": "피아노", "category": "academy", "color_key": "music", "icon_key": "music-note", "alert_mode": "alarm", "alert_before_min": 10, "memo": "16:45 차", "created_at": "2026-09-03 02:00:00"}],
  "day_exceptions": [{"id": 1, "start_date": "2026-10-09", "end_date": "2026-10-09", "type": "holiday", "note": "한글날"}],
  "tasks": [
    {"id": 10, "title": "줄넘기", "repeat_weekdays": "1,3,5", "task_date": null, "remind_time": "19:00", "alert_mode": "notify", "sticker_reward": null, "effective_from": "2026-09-01", "effective_until": null, "created_at": "2026-09-01 03:00:00"},
    {"id": 11, "title": "준비물 챙기기", "repeat_weekdays": null, "task_date": "2026-10-05", "remind_time": null, "alert_mode": "none", "sticker_reward": null, "effective_from": null, "effective_until": null, "created_at": "2026-10-04 12:00:00"}],
  "task_completions": [{"id": 1, "task_id": 10, "completion_date": "2026-10-05", "done_at": "2026-10-05 10:15:00", "done_by": "child"}],
  "task_completion_history": [{"task_id": 10, "completion_date": "2026-10-05"}, {"task_id": 11, "completion_date": "2026-10-05"}],
  "sticker_ledger": [
    {"id": 1, "delta": 3, "reason": "legacy-daily-completions", "task_id": null, "child_id": "local-child", "created_at": "2026-10-01 00:00:00"},
    {"id": 2, "delta": 0, "reason": "daily-completion:2026-10-05", "task_id": 10, "child_id": "local-child", "created_at": "2026-10-05 10:15:00"},
    {"id": 3, "delta": 1, "reason": "manual", "task_id": 99, "child_id": "local-child", "created_at": "2026-10-05 11:00:00"}],
  "rewards": [{"id": 1, "title": "인형", "sticker_goal": 10, "achieved_at": "2026-10-03 09:00:00"}],
  "gem_rights": [{"id": 1, "earned_date": "2026-10-04", "state": "given", "requested_at": "2026-10-04 12:00:00", "given_at": "2026-10-04 13:00:00", "created_at": "2026-10-04 11:00:00"}]
}$j$, true);

-- 외부인(다른 가족)은 이 가족에 넣을 수 없다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000d0003","role":"authenticated"}', true);
select pg_temp.tt_rec('외부인: 남의 가족으로 이전 거부', 'P0001:TT_IMPORT: 이 가족의 딸 계정을 찾지 못했습니다',
  pg_temp.tt_try(format('select public.tt_import_local(%L, %L::jsonb)', current_setting('tt.fam'), current_setting('tt.payload'))));

-- 딸 계정으로 이전
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000d0002","role":"authenticated"}', true);
select set_config('tt.counts', public.tt_import_local(current_setting('tt.fam')::uuid, current_setting('tt.payload')::jsonb)::text, true);
select pg_temp.tt_rec('딸: 테이블별 이전 개수', 'true',
  (current_setting('tt.counts')::jsonb = '{"tasks": 2, "rewards": 1, "periods": 2, "gem_rights": 1, "day_exceptions": 1, "sticker_ledger": 3, "timetable_sets": 2, "timetable_items": 2, "task_completions": 1, "timetable_settings": 1, "task_completion_history": 2}'::jsonb)::text);

select pg_temp.tt_rec('세트 참조 유지(수학=평소, 피아노=방학)', '수학:평소,피아노:방학',
  (select string_agg(i.title || ':' || s.name, ',' order by i.title) from public.tt_timetable_items i join public.tt_timetable_sets s on s.id = i.set_id where i.family_id = current_setting('tt.fam')::uuid));
select pg_temp.tt_rec('적용 중 세트 = 방학', '방학',
  (select s.name from public.tt_timetable_settings t join public.tt_timetable_sets s on s.id = t.active_set_id where t.family_id = current_setting('tt.fam')::uuid));
select pg_temp.tt_rec('교시·시각 항목 값 유지', '2,,|,16:00,17:00,16:45 차,alarm,10',
  (select string_agg(concat_ws(',', coalesce(period_no::text, ''), coalesce(start_time, ''), coalesce(end_time, ''), nullif(memo, ''), nullif(alert_mode, 'none'), nullif(alert_before_min, 0)::text), '|' order by title) from public.tt_timetable_items where family_id = current_setting('tt.fam')::uuid));
select pg_temp.tt_rec('반복 요일 CSV → 배열', '{1,3,5}',
  (select repeat_weekdays::text from public.tt_tasks where family_id = current_setting('tt.fam')::uuid and title = '줄넘기'));
select pg_temp.tt_rec('완료 기록이 새 할 일 id를 가리킴', '줄넘기 2026-10-05',
  (select t.title || ' ' || c.completion_date from public.tt_task_completions c join public.tt_tasks t on t.id = c.task_id where c.family_id = current_setting('tt.fam')::uuid));
select pg_temp.tt_rec('완료 이력 2건이 각 할 일을 가리킴', '준비물 챙기기,줄넘기',
  (select string_agg(t.title, ',' order by t.title) from public.tt_task_completion_history h join public.tt_tasks t on t.id = h.task_id where h.family_id = current_setting('tt.fam')::uuid));
select pg_temp.tt_rec('UTC 시각 변환(2026-09-01 03:00 UTC)', '2026-09-01 03:00:00+00',
  (select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || '+00' from public.tt_tasks where family_id = current_setting('tt.fam')::uuid and title = '줄넘기'));
select pg_temp.tt_rec('원장: 딸 계정·지워진 할 일은 비움·하루 완료는 할 일 연결', '3:legacy-daily-completions:-|0:daily-completion:2026-10-05:줄넘기|1:manual:-',
  (select string_agg(l.delta || ':' || l.reason || ':' || coalesce(t.title, '-'), '|' order by l.created_at) from public.tt_sticker_ledger l left join public.tt_tasks t on t.id = l.task_id
   where l.family_id = current_setting('tt.fam')::uuid and l.child_id = '00000000-0000-4000-8000-0000000d0002'));
select pg_temp.tt_rec('보석 자격: 딸 계정·지급 상태·시각', 'given:2026-10-04:requested,given',
  (select state || ':' || earned_date || ':' || concat_ws(',', case when requested_at is not null then 'requested' end, case when given_at is not null then 'given' end)
   from public.tt_gem_rights where family_id = current_setting('tt.fam')::uuid and child_id = '00000000-0000-4000-8000-0000000d0002'));
select pg_temp.tt_rec('보상 달성 시각 유지', 'true',
  (select (achieved_at is not null)::text from public.tt_rewards where family_id = current_setting('tt.fam')::uuid));

-- 두 번 올리면 아무것도 넣지 않고 멈춘다
select pg_temp.tt_rec('딸: 다시 이전하면 거부', 'P0001:TT_IMPORT: 서버에 이미 이 가족의 데이터가 있습니다',
  pg_temp.tt_try(format('select public.tt_import_local(%L, %L::jsonb)', current_setting('tt.fam'), current_setting('tt.payload'))));
select pg_temp.tt_rec('다시 이전 시도 뒤에도 할 일 2건 그대로', '2',
  (select count(*)::text from public.tt_tasks where family_id = current_setting('tt.fam')::uuid));

-- 로그인하지 않은 사용자는 함수를 부를 수 없다
reset role;
set local role anon;
select pg_temp.tt_rec('anon: 함수 실행 거부', '42501',
  split_part(pg_temp.tt_try(format('select public.tt_import_local(%L, %L::jsonb)', current_setting('tt.fam'), '{}')), ':', 1));
reset role;

-- 결과를 오류로 내보내고 모두 되돌린다
do $$ begin raise exception 'TT_IMPORT_RESULT %', current_setting('tt.r'); end $$;
