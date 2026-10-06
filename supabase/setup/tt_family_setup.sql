-- 채아네 가족 1회 등록(P6.4, 2026-10-06 사용자 결정: 앱에 가족 만들기 화면 없이 CLI로 한 번 등록).
-- 아빠는 Doro와 같은 기존 계정, 딸은 대시보드에서 만든 임시 이메일 계정. 이미 가족에 속한 계정이 있으면 아무것도 하지 않고 오류로 멈춘다.
-- 실제 이메일은 저장소에 두지 않는다. 실행할 때 자리표시자를 채운 임시 파일로 실행한다(2026-10-06 실행 완료: 아빠=Doro 기존 계정, 딸=임시 이메일 계정).
-- 실행 예: sed 's/__PARENT_EMAIL__/아빠이메일/; s/__CHILD_EMAIL__/딸이메일/' supabase/setup/tt_family_setup.sql > <임시파일> 후
--          npx supabase db query --linked --project-ref <ref> -f <임시파일>
begin;
do $$
declare
  v_parent uuid := (select id from auth.users where email = '__PARENT_EMAIL__');
  v_child uuid := (select id from auth.users where email = '__CHILD_EMAIL__');
  v_family uuid;
begin
  if v_parent is null or v_child is null then raise exception 'TT_SETUP: 계정이 없습니다'; end if;
  if exists (select 1 from public.tt_family_members where user_id in (v_parent, v_child)) then
    raise exception 'TT_SETUP: 이미 가족에 속한 계정이 있습니다';
  end if;
  insert into public.tt_families (name) values ('채아네') returning id into v_family;
  insert into public.tt_family_members (family_id, user_id, role, display_name) values
    (v_family, v_parent, 'parent', '아빠'),
    (v_family, v_child, 'child', '채아');
end $$;
commit;
