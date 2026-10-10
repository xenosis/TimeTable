-- 앱에서 발송을 다시 요청하지 않아도 대기 변경과 receipt를 매분 처리한다.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function tt_private.invoke_push_worker()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  worker_url text;
  worker_jwt text;
  worker_secret text;
begin
  select decrypted_secret into worker_url from vault.decrypted_secrets where name = 'tt_push_worker_url';
  select decrypted_secret into worker_jwt from vault.decrypted_secrets where name = 'tt_push_worker_jwt';
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name = 'tt_push_worker_secret';
  if worker_url is null or worker_url !~ '^https://[a-z0-9]{20}\.supabase\.co$'
    or worker_jwt is null or worker_jwt !~ '^eyJ' or coalesce(length(worker_secret), 0) < 32 then
    raise exception 'TT_PUSH: 작업자 서버 인증 설정이 준비되지 않았어요';
  end if;
  return net.http_post(
    url := worker_url || '/functions/v1/tt-push-worker',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_jwt, 'x-tt-push-worker', worker_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;
revoke all on function tt_private.invoke_push_worker() from public, anon, authenticated, service_role;

-- 명명된 작업을 갱신하므로 반복 적용해도 다른 앱의 작업이나 중복 작업을 만들지 않는다.
select cron.schedule('tt-push-worker', '* * * * *', 'select tt_private.invoke_push_worker();');
