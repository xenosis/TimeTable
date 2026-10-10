-- 새 migration과 함께 BEGIN 안에서 실행하고 반드시 ROLLBACK한다.
do $$
declare
  fam uuid := gen_random_uuid();
  usr uuid := gen_random_uuid();
  other_fam uuid := gen_random_uuid();
  other_usr uuid := gen_random_uuid();
  install_a uuid := gen_random_uuid();
  install_b uuid := gen_random_uuid();
  device_a uuid;
  device_b uuid;
  legacy_device uuid := gen_random_uuid();
  secret_a text := repeat('a', 64);
  secret_b text := repeat('b', 64);
  stamp timestamptz := '2026-10-10 08:00:00+00';
begin
  insert into auth.users(id, aud, role, email) values(usr, 'authenticated', 'authenticated', usr::text || '@example.invalid');
  insert into public.tt_families(id, name) values(fam, '설치본 동기화 임시 검증');
  insert into public.tt_family_members(family_id, user_id, role) values(fam, usr, 'child');
  insert into auth.users(id, aud, role, email) values(other_usr, 'authenticated', 'authenticated', other_usr::text || '@example.invalid');
  insert into public.tt_families(id, name) values(other_fam, '계정 전환 임시 검증');
  insert into public.tt_family_members(family_id, user_id, role) values(other_fam, other_usr, 'parent');
  insert into public.tt_devices(id, family_id, user_id, platform, push_token)
    values(legacy_device, fam, usr, 'android', 'ExpoPushToken[test_a]');
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  execute 'SET LOCAL ROLE authenticated';
  device_a := public.tt_record_device_sync(fam, install_a, secret_a, 'test', stamp);
  select last_synced_at into stamp from public.tt_devices where id = device_a;
  if public.tt_register_push_installation(fam, install_a, secret_a, 'ExpoPushToken[test_a]', 'test') <> device_a
    or not exists(select 1 from public.tt_devices where id = device_a and last_synced_at = stamp) then
    raise exception 'TT_DEVICE_TEST: 기록 후 푸시 등록 행 분리';
  end if;
  if not exists(select 1 from public.tt_devices where id = legacy_device and push_token is null and installation_id is null)
    or not exists(select 1 from public.tt_devices where id = device_a and push_token = 'ExpoPushToken[test_a]') then
    raise exception 'TT_DEVICE_TEST: 미연결 구버전 토큰 통합 실패';
  end if;
  begin
    perform public.tt_record_device_sync(other_fam, install_a, secret_a, 'test', stamp);
    raise exception 'TT_DEVICE_TEST: 다른 가족 기록 허용';
  exception when raise_exception then
    if sqlerrm not like 'TT_DEVICE: %' then raise; end if;
  end;
  device_b := public.tt_register_push_installation(fam, install_b, secret_b, 'ExpoPushToken[test_b]', 'test');
  if public.tt_record_device_sync(fam, install_b, secret_b, 'test', stamp + interval '1 minute') <> device_b
    or device_a = device_b or not exists(select 1 from public.tt_devices where id = device_a and last_synced_at = stamp) then
    raise exception 'TT_DEVICE_TEST: 푸시 등록 후 기록 또는 설치본 격리 실패';
  end if;
  begin
    perform public.tt_record_device_sync(fam, install_a, secret_b, 'test', stamp);
    raise exception 'TT_DEVICE_TEST: 잘못된 설치본 증명 허용';
  exception when raise_exception then
    if sqlerrm not like 'TT_DEVICE: %' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.tt_record_device_sync(fam, install_a, secret_a, 'test', stamp);
    raise exception 'TT_DEVICE_TEST: 비로그인 기록 허용';
  exception when raise_exception then
    if sqlerrm not like 'TT_DEVICE: %' then raise; end if;
  end;
  if has_function_privilege('anon', 'public.tt_record_device_sync(uuid,uuid,text,text,timestamptz)', 'EXECUTE') then
    raise exception 'TT_DEVICE_TEST: 익명 함수 호출 권한';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', other_usr, 'role', 'authenticated')::text, true);
  if public.tt_record_device_sync(other_fam, install_a, secret_a, 'test', stamp + interval '2 minutes') <> device_a then
    raise exception 'TT_DEVICE_TEST: 계정 전환 시 설치본 행 분리';
  end if;
  -- 변경 함수 호출과 조회는 별도 문장으로 실행해 새 행 버전을 읽는다.
  if not exists(select 1 from public.tt_devices where id = device_a and user_id = other_usr
      and family_id = other_fam and push_token is null and last_synced_at >= stamp and last_synced_at <= clock_timestamp()) then
    raise exception 'TT_DEVICE_TEST: 계정 전환 시 이전 토큰 제거 실패';
  end if;
  perform public.tt_record_device_sync(other_fam, install_a, secret_a, 'test', stamp + interval '100 years');
  if not exists(select 1 from public.tt_devices where id = device_a
      and last_synced_at <= clock_timestamp() and last_synced_at >= clock_timestamp() - interval '5 seconds') then
    raise exception 'TT_DEVICE_TEST: 폰의 미래 시각을 서버 완료 시각으로 기록하지 못함';
  end if;
  execute 'RESET ROLE';
  raise notice 'TT_DEVICE_TEST: PASS';
end;
$$;
