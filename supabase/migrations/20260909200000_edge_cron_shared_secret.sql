-- Security pass 2026-09-09: the three server-only Edge Functions (check-favorited-foods,
-- populate-dishes, send-ping-push) were callable by anyone holding the public anon/publishable
-- key. verify_jwt = true only demands *a* Supabase-signed JWT, and the publishable key is one -- it
-- ships in every app binary and the web bundle. Confirmed live before this fix:
--
--   curl -X POST https://ubogyqskqzvkcqboqbhw.supabase.co/functions/v1/send-ping-push \
--     -H "Authorization: Bearer sb_publishable_..." -d '{"ping_id":"<random uuid>"}'
--   -> HTTP 200 {"sent":false,...}     (handler ran; no auth header -> 401, so verify_jwt was the
--                                        ONLY gate)
--
-- check-favorited-foods and populate-dishes ignore the request entirely (`async (_req)`), so the
-- same bare-key call runs their full service-role body: 4-5 upstream umassdining.com fetches, a
-- profiles + favorited_foods scan, food_sightings upserts and push dispatch (hourly job), or a
-- ~400-row dishes upsert (daily job) -- per call, in a loop, from any IP. That's a free-tier Edge
-- invocation/egress burner and an umassdining.com abuse vector from Supabase's egress IPs (an
-- upstream block would take the feature down for everyone). send-ping-push is already replay-safe
-- via pushed_at (#196), so it only gains a stop to no-op probing, but it's the same shape and
-- shares the same caller (the pings trigger), so it's closed the same way.
--
-- Fix: a second factor the public key can't supply. The pg_cron jobs and the pings trigger now
-- send an `x-udine-cron-secret` header (value from Vault: `edge_cron_secret`), and each function
-- compares it against its EDGE_CRON_SECRET secret (supabase/functions/_shared/cronAuth.ts). The
-- Authorization: Bearer <publishable key> header stays exactly as 20260818120000 chose it --
-- verify_jwt is unchanged, this is on top. Every other reference to that Vault-backed Authorization
-- header, the schedules, URLs and timeouts are copied verbatim from
-- 20260827110000_check_favorited_foods_cron_timeout.sql, 20260905130000_schedule_populate_dishes.sql
-- and 20260821120000_ping_push_trigger.sql; only the one header is added.
--
-- ONE-TIME OWNER STEPS (out of band, same category as the check_favorited_foods_auth_token Vault
-- seed). Generate one random value (e.g. `openssl rand -base64 32`) and store it in BOTH places:
--
--   1. Vault (SQL editor):
--        select vault.create_secret('<the value>', 'edge_cron_secret');
--   2. Edge Function secrets (CLI, from the repo root):
--        supabase secrets set EDGE_CRON_SECRET='<the value>' --project-ref ubogyqskqzvkcqboqbhw
--
-- ROLLOUT ORDER (net.http_post is fire-and-forget, so a broken cron is silent -- #200's lesson):
--   a. seed the Vault secret (step 1) and the function secret (step 2);
--   b. apply this migration -- the jobs/trigger start sending the header; the currently deployed
--      functions ignore an extra header, so nothing breaks;
--   c. deploy the three functions from main -- they now require the header.
-- Doing (c) before (a) makes every cron run 503 until the secret exists. Doing (b) before (a)
-- sends a null header value -- net.http_post rejects a null jsonb header value, so the cron run
-- errors visibly in cron.job_run_details, and the pings trigger's exception handler swallows it
-- into a warning (ping insert still succeeds, push is skipped) until the secret is seeded.
--
-- Verify after (c): manually run the hourly job's net.http_post (see 20260818120000's own
-- verification recipe) and confirm a 200 in net._http_response; then re-run the curl above with only
-- the publishable key and confirm 403.

-- 1. check-favorited-foods-hourly: same command as 20260827110000 + the secret header.
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
          ),
          'x-udine-cron-secret', (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'edge_cron_secret'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      ) as request_id;
    $$
  );

-- 2. populate-dishes-daily: same command as 20260905130000 + the secret header.
select
  cron.alter_job(
    (select jobid from cron.job where jobname = 'populate-dishes-daily'),
    command := $$
    select
      net.http_post(
        url := 'https://ubogyqskqzvkcqboqbhw.supabase.co/functions/v1/populate-dishes',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'check_favorited_foods_auth_token'
          ),
          'x-udine-cron-secret', (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'edge_cron_secret'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      ) as request_id;
    $$
  );

-- 3. notify_ping_push: same body as 20260821120000 + the secret header. `create or replace` keeps
-- the existing ACL (20260821120100's anon/authenticated/public EXECUTE revoke) and the trigger.
create or replace function public.notify_ping_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform net.http_post(
      url := 'https://ubogyqskqzvkcqboqbhw.supabase.co/functions/v1/send-ping-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'check_favorited_foods_auth_token'
        ),
        'x-udine-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'edge_cron_secret'
        )
      ),
      body := jsonb_build_object('ping_id', new.id)
    );
  exception when others then
    raise warning 'ping push dispatch failed for ping %: %', new.id, sqlerrm;
  end;
  return null; -- AFTER trigger; return value is ignored, but must be non-erroring
end;
$$;

-- 4. Unrelated hygiene caught in the same pass: enforce_favorited_foods_cap() (20260827150000) is
-- the only trigger function in public still EXECUTE-able by anon/authenticated/PUBLIC. Not
-- exploitable -- Postgres refuses to call a trigger-returning function directly ("trigger functions
-- can only be called as triggers"), and EXECUTE is only checked at CREATE TRIGGER time, never when
-- the trigger fires -- but every other trigger function here has this revoke (20260817220100,
-- 20260821120100) and the advisor convention is "revoke unless genuinely needed".
revoke execute on function public.enforce_favorited_foods_cap() from anon, authenticated, public;
