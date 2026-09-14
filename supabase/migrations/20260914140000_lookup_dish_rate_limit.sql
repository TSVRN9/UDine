-- Support tables for the lookup-dish Edge Function (supabase/functions/lookup-dish): an
-- anonymously-callable, on-demand FoodPro Web INA lookup for a dish name not yet in
-- public.dishes. See docs/decisions-log.md's "lookup-dish: on-demand Web INA lookup + rate limit"
-- entry for the full design and the cap's reasoning, and docs/apk-reverse-engineering.md's
-- "FoodPro Web INA" section for the endpoints this protects (af-foodpro1.campus.ads.umass.edu,
-- UMass IT infrastructure, not a CDN).
--
-- Unlike public.dishes (readable by anon/authenticated, per CLAUDE.md's anonymous-first
-- principle), NONE of these four tables are ever read or written directly by a client -- they're
-- lookup-dish's own server-side bookkeeping, always accessed as service_role (which bypasses RLS
-- by design, same as every other service-role-only table in this schema, e.g. dish_lookup_config
-- below). RLS is enabled with zero policies and every grant to anon/authenticated is explicitly
-- revoked, so even a stray future grant reaching one of these tables would still deny by default
-- rather than silently allow. There is deliberately no anon-facing "how many lookups are left"
-- endpoint -- exposing exact budget/timing here would just make the cap easier to game.

-- dish_lookup_config: one tunable row so the owner can raise/lower the hourly cap with a plain
-- `update` (no redeploy of the Edge Function or migration needed). The boolean PK + `check (id)`
-- is a standard Postgres singleton-row trick: id can only ever be `true` (a `false` row fails the
-- check, and id is a PK so there's only ever at most one `true`), which is all this needs -- no
-- ORM/app code ever reads/writes the id column itself.
create table public.dish_lookup_config (
  id boolean primary key default true,
  -- Protects af-foodpro1.campus.ads.umass.edu, NOT Supabase's own Free-tier caps (500k Edge
  -- Function invocations/month, 5GB egress/month -- this feature's footprint against those is
  -- trivial for a UMass-scale anonymous user base doing occasional manual lookups). One live
  -- lookup costs up to 1 location.aspx + 1 search.aspx + MAX_CANDIDATES_PER_REQUEST label.aspx
  -- requests (see index.ts) -- worst case 5 requests, so a cap of 20/hour bounds this feature to
  -- at most ~100 FoodPro requests/hour, comfortably under populate-retail-dishes' own single-run
  -- total of ~196 requests (96 longmenu.aspx + up to 100 label.aspx, docs/decisions-log.md
  -- 2026-09-14), and spread across an hour rather than fired in one burst. This is a GLOBAL budget
  -- for the whole app, not per-user/per-IP -- there's no stable anonymous identity to scope a
  -- per-user quota against (CLAUDE.md: anonymous-first), so a single conservative global cap is
  -- the right level of effort, not a speculative per-account/per-IP scheme nothing else in this
  -- app has. Tune with `update public.dish_lookup_config set hourly_cap = <n>;` if usage patterns
  -- show this is too tight or too loose.
  hourly_cap int not null default 20,
  constraint dish_lookup_config_singleton check (id)
);
insert into public.dish_lookup_config (id, hourly_cap) values (true, 20);

-- dish_lookup_rate_limit: one row per UTC hour bucket, atomically incremented by
-- increment_dish_lookup_count() below. A plain PostgREST upsert can't express `count = count + 1`
-- (it only sets literal values), so the atomic increment-and-return lives in a SQL function.
create table public.dish_lookup_rate_limit (
  hour_bucket timestamptz primary key,
  count int not null default 0
);

-- dish_lookup_misses: negative cache. Recorded only after a real live FoodPro round-trip finds
-- nothing (never for a query lookup-dish didn't actually attempt) -- see index.ts's recordMiss --
-- so this table's own growth is bounded by the same hourly_cap budget above, no separate cleanup
-- job needed. checked_at drives a short TTL window (see index.ts's NEGATIVE_CACHE_TTL_MINUTES) so
-- a typo/garbage query doesn't re-spend budget on every retry within that window, while still
-- letting a later retry (e.g. after UMass Dining actually adds the dish) through.
create table public.dish_lookup_misses (
  query_key text primary key,
  checked_at timestamptz not null default now()
);

-- dish_lookup_inflight: a short-TTL claim row so two near-simultaneous searches for the same dish
-- name don't both spend budget on independent FoodPro round-trips. Insert-if-absent (PostgREST
-- upsert with ignoreDuplicates -- see index.ts's claimInflight): the request that lands the insert
-- is the "leader" doing the live fetch; a request that hits the conflict is a "follower" that
-- polls public.dishes briefly instead of also fetching. claimed_at bounds how long a crashed
-- leader (one that fetched but never reached its own cleanup) can block followers -- index.ts
-- deletes any claim older than INFLIGHT_CLAIM_TTL_SECONDS before attempting its own claim.
create table public.dish_lookup_inflight (
  query_key text primary key,
  claimed_at timestamptz not null default now()
);

alter table public.dish_lookup_config enable row level security;
alter table public.dish_lookup_rate_limit enable row level security;
alter table public.dish_lookup_misses enable row level security;
alter table public.dish_lookup_inflight enable row level security;

revoke all on public.dish_lookup_config, public.dish_lookup_rate_limit, public.dish_lookup_misses, public.dish_lookup_inflight
  from anon, authenticated;
grant all on public.dish_lookup_config, public.dish_lookup_rate_limit, public.dish_lookup_misses, public.dish_lookup_inflight
  to service_role;

-- Atomic increment-and-read for the current UTC hour bucket. security definer + a pinned empty
-- search_path per CLAUDE.md ("every SQL function pins search_path") -- every reference is
-- fully-qualified so an empty search_path can't break it. Execute is revoked from
-- anon/authenticated/public explicitly, this project's own house style for a function that must
-- not be anon-callable (e.g. 20260817220100_revoke_handle_new_user_execute.sql,
-- 20260821120100_revoke_notify_ping_push_execute.sql) -- confirmed live against the local stack
-- while writing this migration that a bare `revoke ... from public` alone is NOT enough here: this
-- setup grants EXECUTE to anon/authenticated as their own separate, explicit ACL entries on every
-- new function, not merely inherited from the PUBLIC pseudo-role, so revoking only from PUBLIC
-- left anon/authenticated still able to call it. Only lookup-dish, calling as service_role, has
-- any legitimate reason to bump this counter -- letting anon call it directly would let a client
-- inflate the bucket without lookup-dish's other checks (catalog hit, negative cache, coalescing)
-- ever running.
create or replace function public.increment_dish_lookup_count()
returns int
language sql
security definer
set search_path = ''
as $$
  insert into public.dish_lookup_rate_limit (hour_bucket, count)
  values (date_trunc('hour', now()), 1)
  on conflict (hour_bucket) do update
    set count = public.dish_lookup_rate_limit.count + 1
  returning count;
$$;

revoke execute on function public.increment_dish_lookup_count() from anon, authenticated, public;
grant execute on function public.increment_dish_lookup_count() to service_role;
