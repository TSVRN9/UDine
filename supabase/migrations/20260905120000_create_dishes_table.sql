-- public.dishes: a global, read-only reference catalog of every unique dish UMass Dining serves
-- (deduplicated by dish name, not split by hall) -- built for the upcoming mobile local-search
-- feature (stacked follow-on PR). NOT a per-user consumption log and NOT the per-user/per-session
-- menu cache CLAUDE.md's data residency table keeps device-only -- this is one shared, global row
-- per dish name, populated by a scheduled Edge Function (populate-dishes), the same way
-- food_sightings is populated only by check-favorited-foods (see
-- 20260817220000_friends_pings_favorited_foods.sql's food_sightings section).
--
-- nutrition is jsonb, not 12 mirrored columns: the only query pattern against this table is an
-- ilike/substring lookup on dish_name (mobile will cache the bulk fetch and search locally, see
-- shared/src/dishes.ts) -- never a filter on a macro value -- and public.shared_stats.top_foods
-- (20260820120000_shared_stats.sql) already established the precedent of a denormalized
-- nutrition-ish jsonb snapshot in this schema rather than a wide typed row.
--
-- dish_name is the primary key (exact-string dedup), matching the ONLY dedup convention already
-- used everywhere else in this codebase -- RankedFood/Favorite in shared/src/types.ts key on the
-- dish name string, and docs/adr/0001-two-elo-tracks-for-dish-ranking.md's per-dish track is keyed
-- the same way. No fuzzy matching, no surrogate id.
--
-- No RLS write policy and no write grant for anon/authenticated at all -- this table is written
-- only by populate-dishes running as service_role, mirroring food_sightings' no-client-write
-- pattern. anon (not just authenticated) gets the SELECT grant: search must work fully signed-out
-- per CLAUDE.md's "Anonymous-first" principle.
--
-- Deliberately NO row-count/size cap (unlike 20_size_and_row_count_caps.sql's caps on
-- favorited_foods etc.): those caps exist specifically because an *authenticated client* can write
-- unbounded rows to those tables. public.dishes has no client write grant at all -- only a daily
-- cron running as service_role -- so it's naturally bounded by the number of unique dishes UMass
-- actually serves (a few thousand at most), not by anything a client can inflate.
create table public.dishes (
  dish_name text primary key,
  nutrition jsonb not null,
  allergens text[] not null default '{}',
  diet_tags text[] not null default '{}',
  last_seen_hall_tid int,
  updated_at timestamptz not null default now()
);

alter table public.dishes enable row level security;

create policy "dishes are readable by anyone"
  on public.dishes for select
  to anon, authenticated
  using (true);

-- Explicit grants required regardless of RLS shape -- auto-expose is removed from this project
-- (see 20260826150000_revoke_legacy_auto_expose_grants.sql); every new-table migration grants
-- explicitly, per 20260824150000_add_friends_discoverability_and_qr.sql's house style.
grant select on public.dishes to anon, authenticated;
grant select, insert, update, delete on public.dishes to service_role;

-- The legacy auto-expose overlay (20260826150000's own comment: "the 2026-10-30 removal only
-- stops FUTURE tables... it does nothing for the 9 tables that already exist") only fixed anon for
-- future tables via `alter default privileges ... revoke all on tables from anon` -- there's no
-- equivalent default-privileges statement for `authenticated`, so THIS table, created after that
-- migration, still comes into existence with the full legacy ALL-privileges grant to
-- `authenticated` layered on top of the narrow SELECT-only grant above. Confirmed live against the
-- local stack immediately after `create table` (aclexplode/information_schema.role_table_grants):
-- authenticated held INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN before this revoke.
-- Strip everything but the SELECT this table intends for `authenticated`, same shape as
-- 20260826150000's own per-table revokes (e.g. `revoke insert, delete on public.profiles from
-- authenticated`).
revoke insert, update, delete, truncate, references, trigger, maintain on public.dishes from authenticated;
