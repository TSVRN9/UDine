-- Hall occupancy history (docs/briefs/hall-occupancy-history.md). The record-occupancy Edge
-- Function samples UMass's get_infov2 every 10 minutes and stores the RAW per-location numbers
-- (headcount + that location's own moderate/notbusy thresholds; the busy/not-busy meaning is
-- inferred, so it is not baked in). Public facts about places, no per-user data -- like public.dishes.
create table public.occupancy_samples (
  location_id int not null,
  observed_at timestamptz not null, -- the run's 10-minute slot, so a retried run can't double-count
  headcount int not null,
  moderate_at int not null,
  notbusy_at int not null,
  pct smallint,   -- upstream busy.pct / busy.level, only when that object is present
  level smallint,
  primary key (location_id, observed_at)
);

-- No policies: no direct reads for anon/authenticated; only service_role (which bypasses RLS) writes.
alter table public.occupancy_samples enable row level security;
revoke all on public.occupancy_samples from anon, authenticated;
grant select, insert, delete on public.occupancy_samples to service_role;

-- Per-15-minute-bucket medians over the trailing 6 weeks for one weekday (0 = Sunday), in
-- America/New_York. Level is inferred per sample from its own thresholds before taking the median.
create function public.occupancy_typical(p_location_id int, p_dow int)
returns table (bucket_start time, median_headcount int, median_level smallint, samples int)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select
      (observed_at at time zone 'America/New_York') as local_ts,
      headcount,
      (case when headcount >= moderate_at then 2 when headcount >= notbusy_at then 1 else 0 end)::smallint as lvl
    from public.occupancy_samples
    where location_id = p_location_id
      and observed_at >= now() - interval '6 weeks'
  )
  select
    (date_trunc('hour', local_ts) + floor(extract(minute from local_ts) / 15) * interval '15 minutes')::time,
    percentile_disc(0.5) within group (order by headcount)::int,
    percentile_disc(0.5) within group (order by lvl)::smallint,
    count(*)::int
  from s
  where extract(dow from local_ts) = p_dow
  group by 1
  order by 1;
$$;

revoke execute on function public.occupancy_typical(int, int) from public;
grant execute on function public.occupancy_typical(int, int) to anon, authenticated, service_role;

-- Same vault secrets + x-udine-cron-secret gate as 20260914150000_schedule_populate_always_available_dishes.sql.
select
  cron.schedule(
    'record-occupancy-every-10-minutes',
    '*/10 * * * *',
    $$
    select
      net.http_post(
        url := 'https://ubogyqskqzvkcqboqbhw.supabase.co/functions/v1/record-occupancy',
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
        timeout_milliseconds := 15000
      ) as request_id;
    $$
  );
