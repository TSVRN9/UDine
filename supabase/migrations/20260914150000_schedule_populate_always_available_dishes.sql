-- Schedules the populate-always-available-dishes Edge Function
-- (supabase/functions/populate-always-available-dishes), a SIBLING of populate-dishes and
-- populate-retail-dishes that seeds the hand-curated Salad Bar / Yogurt Bar / Pizza catalog for the
-- 4 residential halls -- see that function's own header comment,
-- shared/src/alwaysAvailableStations.ts, and docs/briefs/foodpro-menu-expansion.md task 1 for why
-- this is a separate function/migration rather than a change to either existing one (populate-dishes
-- structurally can't see these stations at all; populate-retail-dishes explicitly excludes the 4
-- residential halls and negates locationNum into a synthetic hallTid, the opposite of this
-- function's real-hallTid semantics).
--
-- Cadence: WEEKLY, offset 30 minutes from populate-retail-dishes' own Sunday 07:00 UTC slot --
-- '30 7 * * 0' -- so the two FoodPro-sourced weekly crons never overlap. Weekly for the same reason
-- as populate-retail-dishes: this is a hand-curated, rarely-changing dish list (not a discovery
-- crawl), so there's no daily-rotation reason to run more often -- only nutrition values could ever
-- drift week to week.
--
-- timeout_milliseconds := 60000: this function does ~16 longmenu.aspx requests (4 halls x 4 meal
-- periods) plus up to ~60 label.aspx requests (one per curated dish, see
-- shared/src/alwaysAvailableStations.ts) through a small bounded pool -- meaningfully more than
-- populate-dishes' flat 4, but nowhere near populate-retail-dishes' 96 longmenu.aspx + up to 100
-- label.aspx (hence that function's 180000). 60000 gives comfortable headroom over the expected
-- worst case while staying well clear of the Edge Function platform's own execution limit.
--
-- Same vault secrets + x-udine-cron-secret gate as populate-dishes/populate-retail-dishes
-- (20260905130000_schedule_populate_dishes.sql, 20260909200000_edge_cron_shared_secret.sql) --
-- reused verbatim, not reinvented.
select
  cron.schedule(
    'populate-always-available-dishes-weekly',
    '30 7 * * 0', -- weekly, Sunday 07:30 UTC
    $$
    select
      net.http_post(
        url := 'https://ubogyqskqzvkcqboqbhw.supabase.co/functions/v1/populate-always-available-dishes',
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
