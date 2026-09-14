-- Schedules the populate-retail-dishes Edge Function (supabase/functions/populate-retail-dishes),
-- a SIBLING of populate-dishes that fills in the 24 retail/café FoodPro locations the 4-hall tid
-- system can't reach at all -- see that function's own header comment and docs/decisions-log.md's
-- "Web INA: mirror vs. on-demand, and the `populate-dishes` cron (2026-09-13)" entry for why this
-- is a separate function/migration rather than a change to populate-dishes itself (different cadence,
-- different upstream host, and populate-dishes is mid-fix for an unrelated cron-double-invocation
-- bug in a parallel task).
--
-- Cadence: WEEKLY, not daily -- '0 7 * * 0' (UTC Sunday, a low-traffic slot; one hour before
-- populate-dishes' own 08:00 UTC daily slot so the two never overlap). Retail/café standing menus
-- change far less often than the halls' daily-rotating menus (see the decisions-log entry's
-- reasoning), and this job does meaningfully more HTTP round-trips per run (see below) -- daily
-- would just re-walk the same largely-unchanged menu 7x for no benefit.
--
-- timeout_milliseconds := 180000 (180s), NOT populate-dishes' 30000: this function does two orders
-- of magnitude more HTTP round-trips per invocation (1 location.aspx + 96 longmenu.aspx [24 retail
-- locations x 4 meal periods] + up to 100 label.aspx fetches, vs. populate-dishes' flat 4). Measured
-- live 2026-09-14: the 96 longmenu.aspx requests alone took ~45s; the function's own
-- MAX_LABEL_FETCHES_PER_RUN cap (see its header comment) is what actually keeps a single
-- invocation's WALL-CLOCK TIME under the Edge Function platform's own execution limit -- this
-- timeout_milliseconds setting does NOT and CANNOT raise that platform limit, it only controls how
-- long pg_net's net.http_post waits for a response before logging a timeout in
-- cron.job_run_details. 180000 is set comfortably above the measured worst case (~45s longmenu +
-- ~100 label.aspx x ~0.5s each + politeness delays =~ 110-120s) so a slow-but-successful run isn't
-- misreported as a cron failure.
--
-- Same vault secrets + x-udine-cron-secret gate as populate-dishes
-- (20260905130000_schedule_populate_dishes.sql, 20260909200000_edge_cron_shared_secret.sql) --
-- reused verbatim, not reinvented: check_favorited_foods_auth_token is a generic Supabase-signed
-- JWT (not scoped to any one function, needed only so verify_jwt: true passes), and edge_cron_secret
-- is the second factor supabase/functions/_shared/cronAuth.ts's requireCronSecret checks.
select
  cron.schedule(
    'populate-retail-dishes-weekly',
    '0 7 * * 0', -- weekly, Sunday 07:00 UTC
    $$
    select
      net.http_post(
        url := 'https://ubogyqskqzvkcqboqbhw.supabase.co/functions/v1/populate-retail-dishes',
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
        timeout_milliseconds := 180000
      ) as request_id;
    $$
  );
