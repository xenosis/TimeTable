-- TimeTable 서버: 가족 데이터 변경을 앱이 바로 알 수 있게 Realtime(postgres_changes) 게시에 넣는다 (백로그 P6.7, 2026-10-07)
--  * 앱은 변경 내용 자체를 쓰지 않고 '바뀌었다'는 신호로 동기화를 한 번 더 한다(받아오기·올리기 규칙은 P6.13~P6.15).
--  * 보안 규칙(RLS)이 그대로 적용되어 같은 가족 구성원에게만 전달된다. 앱은 family_id로도 거른다.
--  * 삭제 이벤트를 family_id로 거르려면 replica identity full이 필요하다(Supabase 문서). 테이블이 작아 부담이 적다.
--  * tt_devices는 동기화할 때마다 '마지막 동기화 시각'을 고치므로 넣지 않는다(동기화가 동기화를 부르는 반복을 막는다).
--  * tt_families·tt_family_members는 앱 화면 데이터가 아니라 넣지 않는다.

do $$
declare
  t text;
begin
  foreach t in array array[
    'tt_periods', 'tt_timetable_sets', 'tt_timetable_settings', 'tt_timetable_items', 'tt_day_exceptions',
    'tt_tasks', 'tt_task_completions', 'tt_task_completion_history', 'tt_sticker_ledger', 'tt_rewards', 'tt_gem_rights'
  ] loop
    execute format('alter table public.%I replica identity full', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
