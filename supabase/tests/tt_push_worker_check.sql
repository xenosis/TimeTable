-- 의도적인 결과 예외로 전체 롤백한다. 실제 URL·인증값을 읽거나 HTTP 전송하지 않는다.
begin;
delete from vault.secrets where name in ('tt_push_worker_url', 'tt_push_worker_jwt', 'tt_push_worker_secret');
select vault.create_secret('https://abcdefghijklmnopqrst.supabase.co', 'tt_push_worker_url');
select vault.create_secret('eyJtest', 'tt_push_worker_jwt');
select vault.create_secret(repeat('x', 64), 'tt_push_worker_secret');
select tt_private.invoke_push_worker();
select cron.schedule('tt-push-worker', '* * * * *', 'select tt_private.invoke_push_worker();');
do $$
declare result jsonb;
begin
  result := jsonb_build_object(
    'anon_denied', not has_function_privilege('anon', 'tt_private.invoke_push_worker()', 'execute'),
    'authenticated_denied', not has_function_privilege('authenticated', 'tt_private.invoke_push_worker()', 'execute'),
    'service_role_denied', not has_function_privilege('service_role', 'tt_private.invoke_push_worker()', 'execute'),
    'single_job', (select count(*) = 1 from cron.job where jobname = 'tt-push-worker'),
    'request_queued', (select count(*) = 1 from net.http_request_queue
      where url = 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/tt-push-worker'
        and headers->>'Authorization' = 'Bearer eyJtest'
        and headers->>'x-tt-push-worker' = repeat('x', 64)));
  raise exception 'TT_PUSH_WORKER_CHECK: %', result;
end;
$$;
