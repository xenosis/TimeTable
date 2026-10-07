-- 설치본 비밀 값으로만 이전 계정의 기기 등록을 옮긴다. 비밀 값 원문은 저장하지 않는다.
alter table public.tt_devices add column installation_id uuid unique;
create table tt_private.push_installations (
  id uuid primary key,
  secret_hash bytea not null check (octet_length(secret_hash) = 32),
  device_id uuid unique references public.tt_devices(id) on delete set null
);
alter table tt_private.push_installations enable row level security;
revoke all on tt_private.push_installations from public, anon, authenticated;

create function tt_private.register_push_installation(
  p_family uuid, p_installation uuid, p_secret text, p_token text, p_version text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  installation tt_private.push_installations%rowtype;
  device public.tt_devices%rowtype;
  digest bytea;
begin
  if caller is null or not exists (
    select 1 from public.tt_family_members m where m.family_id = p_family and m.user_id = caller and m.role = 'child'
  ) then raise exception 'TT_PUSH: 현재 가족의 딸 계정으로 로그인해 주세요'; end if;
  if p_installation is null or p_secret is null or p_secret !~ '^[0-9a-f]{64}$'
    or p_token is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'
    or p_version is null or char_length(p_version) > 40 then
    raise exception 'TT_PUSH: 잘못된 기기 등록 정보';
  end if;
  digest := pg_catalog.sha256(pg_catalog.convert_to(p_secret, 'UTF8'));
  insert into tt_private.push_installations(id, secret_hash) values(p_installation, digest) on conflict(id) do nothing;
  select * into installation from tt_private.push_installations where id = p_installation for update;
  if installation.secret_hash is distinct from digest then raise exception 'TT_PUSH: 설치본 확인 실패'; end if;
  if installation.device_id is not null then
    select * into device from public.tt_devices where id = installation.device_id for update;
  else
    -- 첫 등록에서 자기 계정의 구버전 토큰 행만 이어받는다. 다른 설치본은 가져오지 않는다.
    select * into device from public.tt_devices where user_id = caller and push_token = p_token
      and installation_id is null for update;
  end if;
  if device.id is null then
    insert into public.tt_devices(family_id, user_id, push_token, platform, app_version, installation_id)
    values(p_family, caller, p_token, 'android', p_version, p_installation) returning * into device;
  else
    -- 계정을 바꾸면 이전 가족의 동기화 성공 시각을 새 가족 상태로 보여 주지 않는다.
    update public.tt_devices set family_id = p_family, user_id = caller, push_token = p_token,
      installation_id = p_installation, app_version = p_version, platform = 'android',
      last_synced_at = case when user_id = caller and family_id = p_family then last_synced_at else null end,
      scheduled_count = case when user_id = caller and family_id = p_family then scheduled_count else null end
    where id = device.id;
  end if;
  update tt_private.push_installations set device_id = device.id where id = p_installation;
  return device.id;
end;
$$;
create function public.tt_register_push_installation(
  p_family uuid, p_installation uuid, p_secret text, p_token text, p_version text
) returns uuid language sql security invoker set search_path = '' as $$
  select tt_private.register_push_installation(p_family, p_installation, p_secret, p_token, p_version);
$$;
revoke all on function tt_private.register_push_installation(uuid, uuid, text, text, text),
  public.tt_register_push_installation(uuid, uuid, text, text, text) from public, anon;
grant execute on function tt_private.register_push_installation(uuid, uuid, text, text, text),
  public.tt_register_push_installation(uuid, uuid, text, text, text) to authenticated;

create function tt_private.unregister_push_installation(p_installation uuid, p_secret text)
returns void language plpgsql security definer set search_path = '' as $$
declare installation tt_private.push_installations%rowtype;
begin
  if auth.uid() is null then raise exception 'TT_PUSH: 로그인이 필요해요'; end if;
  select * into installation from tt_private.push_installations where id = p_installation for update;
  if not found then return; end if;
  if p_secret is null or installation.secret_hash is distinct from pg_catalog.sha256(pg_catalog.convert_to(p_secret, 'UTF8')) then
    raise exception 'TT_PUSH: 설치본 확인 실패';
  end if;
  update public.tt_devices set push_token = null where id = installation.device_id;
end;
$$;
create function public.tt_unregister_push_installation(p_installation uuid, p_secret text)
returns void language sql security invoker set search_path = '' as $$
  select tt_private.unregister_push_installation(p_installation, p_secret);
$$;
revoke all on function tt_private.unregister_push_installation(uuid, text),
  public.tt_unregister_push_installation(uuid, text) from public, anon;
grant execute on function tt_private.unregister_push_installation(uuid, text),
  public.tt_unregister_push_installation(uuid, text) to authenticated;
