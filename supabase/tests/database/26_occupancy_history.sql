-- occupancy_samples (record-occupancy Edge Function writes as service_role) + occupancy_typical RPC
-- + the */10 cron. Docs: docs/briefs/hall-occupancy-history.md.
create extension if not exists pgtap;

begin;
select plan(13);

-- grants / RLS
select ok((select relrowsecurity from pg_class where oid = 'public.occupancy_samples'::regclass), 'RLS is on for occupancy_samples');
select ok(not has_table_privilege('anon', 'public.occupancy_samples', 'select'), 'anon cannot select occupancy_samples');
select ok(not has_table_privilege('authenticated', 'public.occupancy_samples', 'select'), 'authenticated cannot select occupancy_samples');
select ok(not has_table_privilege('anon', 'public.occupancy_samples', 'insert'), 'anon cannot insert occupancy_samples');
select ok(not has_table_privilege('authenticated', 'public.occupancy_samples', 'truncate'), 'authenticated cannot truncate occupancy_samples');
select ok(not has_table_privilege('anon', 'public.occupancy_samples', 'truncate'), 'anon cannot truncate occupancy_samples');
select ok(has_table_privilege('service_role', 'public.occupancy_samples', 'insert'), 'service_role can insert occupancy_samples');
select ok(has_function_privilege('anon', 'public.occupancy_typical(int, int)', 'execute'), 'anon can execute occupancy_typical');
select ok(not has_function_privilege('public', 'public.occupancy_typical(int, int)', 'execute'), 'public cannot execute occupancy_typical');

-- cron
select is(
  (select schedule from cron.job where jobname = 'record-occupancy-every-10-minutes'),
  '*/10 * * * *',
  'record-occupancy runs every 10 minutes, all day'
);
select matches(
  (select command from cron.job where jobname = 'record-occupancy-every-10-minutes'),
  '''x-udine-cron-secret''',
  'record-occupancy cron sends the x-udine-cron-secret header'
);

-- RPC: location 9001, three recent same-weekday samples in the 10:15 NY bucket (10:20 local),
-- headcounts 100/300/200 against moderate 250 / notbusy 150 -> levels 0/2/1 -> medians 200 / 1.
-- A 7-week-old sample in the same bucket (headcount 9999) must be outside the 6-week window.
-- Local dates are built in America/New_York so a DST change inside the window can't shift buckets.
create temp table seed as
  select (((now() at time zone 'America/New_York')::date - 7 * k) + time '10:20') at time zone 'America/New_York' as ts, k
  from generate_series(1, 7) k;
insert into public.occupancy_samples (location_id, observed_at, headcount, moderate_at, notbusy_at)
select 9001, ts, case k when 1 then 100 when 2 then 300 when 3 then 200 else 9999 end, 250, 150 from seed where k <= 3;
insert into public.occupancy_samples (location_id, observed_at, headcount, moderate_at, notbusy_at)
select 9001, ts, 9999, 250, 150 from seed where k = 7;

select is(
  (select row(bucket_start, median_headcount, median_level, samples)::text
   from public.occupancy_typical(9001, (select extract(dow from ts)::int from seed where k = 1))),
  '(10:15:00,200,1,3)',
  'occupancy_typical returns the per-bucket medians for seeded samples, ignoring samples older than 6 weeks'
);

set local role anon;
select is(
  (select count(*)::int from public.occupancy_typical(9001, (select extract(dow from ts)::int from (select ((now() at time zone 'America/New_York')::date - 7) + time '10:20' as ts) s))),
  1,
  'anon can call occupancy_typical and gets the bucket'
);
reset role;

select * from finish();
rollback;
