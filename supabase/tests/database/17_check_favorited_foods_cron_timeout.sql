-- Issue #200: pg_net's http_post call inside the check-favorited-foods-hourly cron job had no
-- timeout_milliseconds argument, silently defaulting to pg_net's 5s timeout -- well under the
-- function's observed 2-16s runtime (4 serial hall fetches + hours), causing live 401/timeout
-- retries (see 20260827110000_check_favorited_foods_cron_timeout.sql's own header comment for the
-- live evidence). This only proves the scheduled command text now carries the argument -- it does
-- NOT and cannot make the job actually fire (same networkless-local-stack limitation documented in
-- 07_ping_push_trigger.sql and 16_ping_replay_guard_and_pings_hardening.sql), so it can't prove the
-- timeout value actually fixes the live retries -- see the PR body for the post-apply, live
-- verification steps (net._http_response / edge logs) that do.
--
-- Confirmed this isn't a fix-shaped string rather than a real fix: local pg_net is 0.20.4 (same
-- version as the live user_agent named in #200) and
-- `select pg_get_function_arguments(oid) from pg_proc where proname = 'http_post' and
-- pronamespace = 'net'::regnamespace` shows `timeout_milliseconds integer DEFAULT 5000` as a real,
-- correctly-typed net.http_post parameter (also confirming the 5s default the issue names as the
-- root cause) -- and executing the exact post-fix call body directly returned a request_id, not a
-- parameter error. Also mutation-tested, not just migration-removed-tested: with the migration's
-- own `timeout_milliseconds` temporarily changed to 5000, test 2 below goes red (regex no longer
-- matches "30000"); reverted, it's green again -- so this pins the value, not just the argument's
-- presence.
create extension if not exists pgtap;

begin;
select plan(3);

select ok(
  exists (select 1 from cron.job where jobname = 'check-favorited-foods-hourly'),
  'check-favorited-foods-hourly cron job is scheduled'
);

-- The actual #200 fix: without it, this file's own migration wouldn't exist and this assertion
-- fails against pre-fix main (confirmed red before the migration was added -- see PR body).
select matches(
  (select command from cron.job where jobname = 'check-favorited-foods-hourly'),
  'timeout_milliseconds\s*:=\s*30000',
  'the scheduled net.http_post call sets timeout_milliseconds := 30000'
);

-- Sanity: the fix only added an argument, it didn't drop or rewrite the rest of the call.
select matches(
  (select command from cron.job where jobname = 'check-favorited-foods-hourly'),
  'https://ubogyqskqzvkcqboqbhw\.supabase\.co/functions/v1/check-favorited-foods',
  'the job still posts to the check-favorited-foods function URL'
);

select * from finish();
rollback;
