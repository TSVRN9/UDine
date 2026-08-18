-- Issue #10 / ADR 0002: schedule check-favorited-foods now that push dispatch actually works
-- (issue #9, verified live as function v7 per CLAUDE.md). Wires up pg_cron + pg_net to call the
-- deployed Edge Function on a recurring schedule, matching the mechanism chosen (but deliberately
-- not wired up) in docs/adr/0002-defer-check-favorited-foods-cron.md.

-- 1. Extensions -------------------------------------------------------------------------------
-- Both already show as available-but-not-installed on the project (checked via list_extensions
-- before writing this migration) — `if not exists` makes this safe to apply regardless, and safe
-- to re-run.
create extension if not exists pg_cron with schema pg_catalog;

-- Supabase's own pg_cron setup docs (https://supabase.com/docs/guides/cron/install) grant these
-- to `postgres` explicitly rather than relying on extension-install defaults.
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- pg_net creates its own `net` schema; no extra grants documented/needed for cron.schedule's use.
create extension if not exists pg_net;

-- 2. Auth for the http_post call --------------------------------------------------------------
-- check-favorited-foods is deployed with verify_jwt: true, so the request just needs *a* valid
-- Supabase-signed JWT in Authorization — the function itself ignores the incoming request
-- entirely and does its own DB access with SUPABASE_SERVICE_ROLE_KEY from its own Edge Function
-- secrets (see supabase/functions/check-favorited-foods/index.ts: `Deno.serve(async (_req) => ...`
-- never reads _req). So the anon/publishable key — not the service-role key — is sufficient here:
-- it passes verify_jwt but carries no elevated DB privilege, the least-privilege choice given this
-- cron job doesn't need more. This is also exactly what Supabase's own "Scheduling Edge Functions"
-- doc uses in its worked example. Empirically confirmed, not just inferred: curled the deployed
-- function directly with both the legacy anon JWT and the modern sb_publishable_... key on
-- 2026-08-18 — both got a live 200 with the function's normal JSON body; no Authorization header
-- correctly got 401 UNAUTHORIZED_NO_AUTH_HEADER. Either key works; the vault instructions below
-- use the modern publishable key since that's Supabase's current recommendation for new use.
--
-- The key still isn't hardcoded into this file — pulled from Supabase Vault by name instead, per
-- that same doc's recommendation ("we recommend storing them in Supabase Vault"). Seeding the
-- vault entry is a one-time, out-of-band step (same category as the @umass.edu auth-hook dashboard
-- registration noted in CLAUDE.md — this migration wires up the mechanism, the credential itself
-- is provisioned separately, not committed). THIS MIGRATION IS INERT UNTIL THAT SECRET EXISTS —
-- see PR description for the exact command to run once, before or after applying this file:
--
--   select vault.create_secret(
--     '<the project''s anon/publishable key, from Project Settings > API>',
--     'check_favorited_foods_auth_token'
--   );
--
-- cron.schedule below reads it back via vault.decrypted_secrets at call time. Note that
-- net.http_post is asynchronous — it enqueues the request and returns a request_id immediately,
-- so cron.job_run_details will show this job as "succeeded" on every run regardless of what the
-- HTTP call actually returns (a missing/wrong vault secret will NOT show up as a failed cron run).
-- To check what actually happened, join on the request_id in pg_net's own response table instead:
--   select * from net._http_response where id = <request_id> order by created desc;
-- (status_code there, plus content/error_msg) — or check the Edge Function's own invocation logs.

-- 3. Schedule -----------------------------------------------------------------------------------
-- Cadence: hourly during UMass Dining hours. The function re-fetches all 4 halls' live menus per
-- invocation (see CLAUDE.md: "fetches live foodpro-menu-ajax data for all 4 halls"), so hourly
-- balances "spotted" alert latency against not hammering umassdining.com or burning function
-- invocations overnight when no hall is serving.
--
-- Dining hours run roughly 7am-9pm Eastern (breakfast open through dinner close, across halls).
-- pg_cron schedules are fixed UTC — no timezone parameter — so this is converted by hand for
-- Eastern Daylight Time (UTC-4, in effect as of this writing, 2026-08-18):
--   7am-9pm EDT  ==  11:00-01:00 UTC (crosses midnight UTC)
-- expressed as the hour list below. This does NOT auto-adjust for DST: once EST (UTC-5) resumes
-- in November, the same UTC hours will fire at 6am-8pm Eastern instead of 7am-9pm — one hour
-- early at both ends until this expression is manually shifted. Acceptable drift for a "spotted
-- nearby" alert (not correctness-critical), revisit if it actually matters more than a one-line
-- migration to fix twice a year.
--
-- The comma-separated hour-range list below (`11-23,0-1`) is standard Vixie-cron syntax and
-- pg_cron 1.6.4 (the version available on this project per list_extensions) should accept it, but
-- this wasn't run against a live pg_cron from this sandbox (no psql/local Postgres available here)
-- — cron.schedule validates its expression at call time and raises immediately if it's malformed,
-- so a bad expression fails loudly the moment this migration is applied, not silently later.
select
  cron.schedule(
    'check-favorited-foods-hourly',
    '0 11-23,0-1 * * *', -- hourly, minute 0, UTC hours covering ~7am-9pm Eastern (see comment above)
    $$
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
        body := '{}'::jsonb
      ) as request_id;
    $$
  );
