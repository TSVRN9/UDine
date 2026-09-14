-- 20260914150000_schedule_populate_always_available_dishes.sql: pins the
-- populate-always-available-dishes-weekly cron job's schedule, secret-header shape, and timeout --
-- same convention as 23_populate_retail_dishes_cron.sql (that function's own sibling migration).
-- No new table/policy/grant is introduced by that migration (this function also writes
-- public.dishes via service_role, exactly like populate-dishes and populate-retail-dishes --
-- 21_dishes_read_only.sql's RLS/grant coverage already applies), so this file only needs to cover
-- the cron job itself.
--
-- Mutation-tested: with the migration's 'x-udine-cron-secret' header entry removed, assertion 2
-- goes red; with the schedule string changed, assertion 3 goes red; with timeout_milliseconds
-- changed to 5000, assertion 4 goes red.
create extension if not exists pgtap;

begin;
select plan(4);

select ok(
  exists (select 1 from cron.job where jobname = 'populate-always-available-dishes-weekly'),
  'populate-always-available-dishes-weekly cron job is scheduled'
);

select matches(
  (select command from cron.job where jobname = 'populate-always-available-dishes-weekly'),
  '''x-udine-cron-secret''',
  'populate-always-available-dishes-weekly sends the x-udine-cron-secret header'
);

select is(
  (select schedule from cron.job where jobname = 'populate-always-available-dishes-weekly'),
  '30 7 * * 0',
  'populate-always-available-dishes-weekly runs weekly (Sunday 07:30 UTC, offset from the other two weekly/daily FoodPro crons), not daily'
);

select matches(
  (select command from cron.job where jobname = 'populate-always-available-dishes-weekly'),
  'timeout_milliseconds\s*:=\s*60000',
  'the scheduled net.http_post call sets a timeout_milliseconds generous enough for this function''s ~16 longmenu.aspx + ~60 label.aspx fetches'
);

select * from finish();
rollback;
