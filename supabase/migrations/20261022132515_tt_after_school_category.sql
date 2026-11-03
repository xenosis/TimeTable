-- P18: 기존 행/RLS/권한/RPC를 유지하며 일정 종류에 방과후만 추가한다.
-- 운영 적용은 별도 승인 후 진행한다. 구버전 앱은 새 분류를 읽지 못할 수 있으므로 함께 업데이트한다.
begin;
set local lock_timeout = '5s';
alter table public.tt_timetable_items
  drop constraint tt_timetable_items_category_check,
  add constraint tt_timetable_items_category_check
    check (category in ('school', 'after_school', 'academy', 'care', 'life'));
commit;
