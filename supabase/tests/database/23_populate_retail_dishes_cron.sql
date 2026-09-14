-- 20260914120000_schedule_populate_retail_dishes.sql: pins the populate-retail-dishes-weekly cron
-- job's schedule, secret-header shape, and timeout -- same convention as 22_edge_cron_shared_secret.sql
-- (populate-dishes-daily) and 21_dishes_read_only.sql's timeout pin. No new table/policy/grant is
-- introduced by that migration (populate-retail-dishes writes public.dishes via service_role,
-- exactly like populate-dishes -- 21_dishes_read_only.sql's RLS/grant coverage already applies), so
-- this file only needs to cover the cron job itself.
--
-- Mutation-tested: with the migration's 'x-udine-cron-secret' header entry removed, assertion 2 goes
-- red; with the schedule string changed, assertion 3 goes red; with timeout_milliseconds changed to
-- 30000, assertion 4 goes red.
create extension if not exists pgtap;

begin;
select plan(4);

select ok(
  exists (select 1 from cron.job where jobname = 'populate-retail-dishes-weekly'),
  'populate-retail-dishes-weekly cron job is scheduled'
);

select matches(
  (select command from cron.job where jobname = 'populate-retail-dishes-weekly'),
  '''x-udine-cron-secret''',
  'populate-retail-dishes-weekly sends the x-udine-cron-secret header'
);

select is(
  (select schedule from cron.job where jobname = 'populate-retail-dishes-weekly'),
  '0 7 * * 0',
  'populate-retail-dishes-weekly runs weekly (Sunday 07:00 UTC), not daily'
);

select matches(
  (select command from cron.job where jobname = 'populate-retail-dishes-weekly'),
  'timeout_milliseconds\s*:=\s*180000',
  'the scheduled net.http_post call sets a generous timeout_milliseconds given this function''s much larger request count'
);

select * from finish();
rollback;
