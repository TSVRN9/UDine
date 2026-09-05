-- Schedules the populate-dishes Edge Function (public.dishes' only writer) on pg_cron + pg_net,
-- mirroring 20260818120000_schedule_check_favorited_foods.sql's mechanism exactly. pg_cron/pg_net
-- are already installed by that migration -- no `create extension` here.
--
-- Cadence: once daily, '0 8 * * *' (UTC), NOT hourly like check-favorited-foods. That job needs to
-- run hourly for "spotted today" push-alert freshness; populate-dishes doesn't have an analogous
-- freshness requirement -- foodpro-menu-ajax returns a hall's ENTIRE day in one response, so one
-- fetch per hall per day is already the full day's data, and this is a slowly-changing reference
-- catalog (dish names + nutrition facts), not a "what's being served right now" feed. Once a day
-- keeps it current without hammering umassdining.com 24x more than necessary.
--
-- Reuses the check_favorited_foods_auth_token vault secret verbatim -- see that migration's own
-- comment: it's a generic valid Supabase-signed JWT (anon/publishable key), not scoped to any one
-- function, needed only so populate-dishes' verify_jwt: true passes; the function does its own DB
-- access with SUPABASE_SERVICE_ROLE_KEY from its own Edge Function secrets, same as
-- check-favorited-foods.
--
-- timeout_milliseconds := 30000 set from THIS migration, not discovered later: issue #200's
-- incident history (see 20260827110000_check_favorited_foods_cron_timeout.sql) is that pg_net
-- defaults to a 5-second timeout, and check-favorited-foods' identical 4-serial-hall-fetch shape
-- measured 2-16s in production -- well past that default, causing real 401/timeout retries.
-- populate-dishes does the exact same 4-serial-hall-fetch shape (plus an upsert), so it inherits
-- the same risk unless the timeout is set here from the start.
select
  cron.schedule(
    'populate-dishes-daily',
    '0 8 * * *', -- daily at 08:00 UTC
    $$
    select
      net.http_post(
        url := 'https://ubogyqskqzvkcqboqbhw.supabase.co/functions/v1/populate-dishes',
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
