-- Issue #200 (Fable config audit, live project, 2026-08-24) -- the pg_cron -> pg_net delivery path
-- for check-favorited-foods-hourly is degrading. net._http_response shows 3 of the last 6 hourly
-- requests as timed_out=true, status_code=null (ids 88/89/91), and edge logs show paired
-- Authorization-less pg_net retries rejected 401 (UNAUTHORIZED_NO_AUTH_HEADER, user_agent
-- pg_net/0.20.4). The function's runtime (4 serial hall fetches + hours, observed 2-16s) regularly
-- exceeds pg_net's *default* 5-second timeout -- net.http_post has no timeout_milliseconds
-- argument at all in the original scheduling migration
-- (20260818120000_schedule_check_favorited_foods.sql), so it was silently using that 5s default.
--
-- Today every hour still lands one authenticated 200 (of what looks like more than one attempt --
-- consistent with pg_net retrying after its own timeout), but that's luck, not a guarantee: if a
-- run ever resolves as ONLY the timed-out attempt, that hour silently does nothing while
-- cron.job_run_details still says "succeeded" -- net.http_post is fire-and-forget, exactly the
-- pitfall the original scheduling migration's own comment already warns about (it enqueues a
-- request and returns a request_id regardless of what the HTTP call actually does).
--
-- Fix: add timeout_milliseconds := 30000 to the same net.http_post call, comfortably above the
-- observed 2-16s runtime ceiling with headroom for a slow day, without leaving a hung request
-- object around indefinitely on a genuinely broken function.
--
-- cron.alter_job (not unschedule+reschedule) keeps the job's jobid stable and avoids a window with
-- no job scheduled at all between the two statements -- only the command text actually changes
-- here, so a full unschedule/reschedule pair would be strictly more moving parts for the same
-- result. Schedule, job name, URL, and auth all stay exactly as in
-- 20260818120000_schedule_check_favorited_foods.sql -- see that file for the DST caveat on the
-- schedule expression (unaffected by this change) and the vault-secret setup this job still
-- depends on.
select
  cron.alter_job(
    (select jobid from cron.job where jobname = 'check-favorited-foods-hourly'),
    command := $$
    select
      net.http_post(
        url := 'https://ubogyqskqzvkcqboqbhw.supabase.co/functions/v1/check-favorited-foods',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'check_favorited_foods_auth_token'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      ) as request_id;
    $$
  );
