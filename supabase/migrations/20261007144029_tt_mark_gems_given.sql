-- 아빠 폰의 보석 지급. 같은 요청 ID 재전송은 이미 지급된 행을 그대로 두므로 중복 지급하지 않는다.
create function public.tt_mark_gems_given(p_family uuid, p_ids bigint[]) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  expected integer;
  actual integer;
begin
  if not tt_private.is_family_parent(p_family) then
    raise exception 'TT_GIVEN: 아빠 계정에서만 지급을 기록할 수 있어요';
  end if;
  expected := cardinality(p_ids);
  if expected is null or expected < 1 or expected > 999
     or expected <> (select count(distinct id) from unnest(p_ids) id) then
    raise exception 'TT_GIVEN: 지급할 보석 요청을 다시 확인해 주세요';
  end if;
  -- 요청 ID를 고정해 두 기기의 중복 클릭·응답 유실 후 재시도에도 같은 보석만 지급한다.
  perform id from public.tt_gem_rights
    where family_id = p_family and id = any(p_ids) order by id for update;
  select count(*) into actual from public.tt_gem_rights
    where family_id = p_family and id = any(p_ids) and state in ('requested', 'given');
  if actual <> expected then
    raise exception 'TT_GIVEN: 보석 요청이 바뀌었어요. 새로 확인한 뒤 기록해 주세요';
  end if;
  update public.tt_gem_rights set state = 'given', given_at = now()
    where family_id = p_family and id = any(p_ids) and state = 'requested';
  return expected;
end;
$$;
revoke execute on function public.tt_mark_gems_given(uuid, bigint[]) from public, anon;
grant execute on function public.tt_mark_gems_given(uuid, bigint[]) to authenticated;
