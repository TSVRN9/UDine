-- Schedules the send-dish-alerts Edge Function (docs/briefs/flutter-port-alert-push.md Task 5).
--
-- Two jobs, 11:00 and 12:00 UTC daily. pg_cron is UTC and ignores DST (see
-- 20260818120000_schedule_check_favorited_foods.sql), so the pair covers 7:00 AM Eastern in both EDT
-- and EST; the function reads Eastern time itself and only sends between 7:00 and 9:00 AM Eastern,
-- and dish_alerts_sent dedups the second run (owner answer 2).
--
-- Inert until the owner creates the secrets: with no Vault edge_cron_secret / auth token the header
-- subselects are NULL and the function's requireCronSecret gate refuses the call. Same Vault secrets,
-- URL shape and x-udine-cron-secret gate as 20260914150000_schedule_populate_always_available_dishes.sql.
-- cron.schedule() with an existing jobname replaces that job, so re-running is idempotent.
select
  cron.schedule(
    'send-dish-alerts-1100-utc',
    '0 11 * * *', -- daily, 11:00 UTC
    $$
    select
      net.http_post(
        url := 'https://ubogyqskqzvkcqboqbhw.supabase.co/functions/v1/send-dish-alerts',
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
        timeout_milliseconds := 60000
      ) as request_id;
    $$
  );
select
  cron.schedule(
    'send-dish-alerts-1200-utc',
    '0 12 * * *', -- daily, 12:00 UTC
    $$
    select
      net.http_post(
        url := 'https://ubogyqskqzvkcqboqbhw.supabase.co/functions/v1/send-dish-alerts',
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
        timeout_milliseconds := 60000
      ) as request_id;
    $$
  );
