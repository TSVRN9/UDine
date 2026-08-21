-- #94: shared-stats opt-in. Owner-decided privacy model (2026-08-19, epic #87): friend-visible
-- stats (hall completion, top foods, hall ranking) are OPT-IN PER STAT, default all-off. Privacy by
-- presence -- a stat the user hasn't opted into is NULL/absent server-side, never written, and
-- toggling a stat back off deletes that field (not just stops updating it). This is the one
-- sanctioned amendment to CLAUDE.md's data residency table (see that file's amended row): a coarse,
-- truncated, user-controlled derived summary is allowed to leave the device, unlike the raw
-- comparisons / full per-dish rank order it's derived from, which stay device-only always.
--
-- One row per user, three independently-nullable jsonb columns instead of three tables, so presence
-- is a single glance (`select * from shared_stats where user_id = ...`) rather than three joins/
-- absences to reconcile.
create table public.shared_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Array of { hallTid, loggedDistinct, seenDistinct } -- see shared/src/completion.ts's
  -- HallCompletion, minus its own `pct` (recomputed on render via youPaneFormat's
  -- displayCompletionPct so a viewer's math always matches the owner's own pane, not a
  -- possibly-stale stored percentage).
  completion jsonb,
  -- Array of { dishName, score, hallName } -- youPaneFormat's TopFoodDisplay, minus `tone`
  -- (viewer-side presentation, recomputed on render, not data) and minus comparisonCount/any
  -- timestamp (the "never counts/history" rule from #94's own spec). hallName is a location, not a
  -- count or a timestamp, so it stays.
  top_foods jsonb,
  -- Array of { hallTid, rank } -- ranking.ts's DiningHallRank, the full ranked order (distinct from
  -- the top-3-only favorite_dining_halls table, which exists for a different purpose: ping-hall
  -- suggestions, and syncs unconditionally on sign-in rather than per-stat opt-in).
  hall_ranks jsonb,
  updated_at timestamptz not null default now(),
  -- A JSON *null* (jsonb 'null'::jsonb) is a distinct, non-NULL value from SQL NULL -- `is null`
  -- would silently pass a written literal-null through as if the column were unset, which breaks
  -- "privacy by presence" the moment any future caller writes `{ field: null }` as a JS value that
  -- serializes to a JSON null instead of an absent key. These constraints make that impossible to
  -- store by mistake, at the DB layer, not just by client-code convention.
  constraint shared_stats_completion_not_json_null check (completion is null or jsonb_typeof(completion) <> 'null'),
  constraint shared_stats_top_foods_not_json_null check (top_foods is null or jsonb_typeof(top_foods) <> 'null'),
  constraint shared_stats_hall_ranks_not_json_null check (hall_ranks is null or jsonb_typeof(hall_ranks) <> 'null')
);

alter table public.shared_stats enable row level security;

-- Owner: full CRUD on their own row, mirrors favorite_dining_halls/favorited_foods/push_tokens'
-- single "own row" policy shape.
create policy "owners manage their own shared stats"
  on public.shared_stats
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Friends: read-only, and only with an ACCEPTED friendship -- mirrors pings' "friends can send
-- pings" check (least/greatest against the canonically-ordered friendships PK) but for select
-- instead of insert. This is a second, separate permissive SELECT policy; Postgres ORs permissive
-- policies together, so the owner (via the policy above) and an accepted friend (via this one) can
-- both read, and a pending-only connection or a stranger gets zero rows back -- no error, just an
-- empty result, same as every other RLS-filtered select in this schema. `anon` doesn't even reach
-- RLS: there's no grant to `anon` below (matching every other table in this schema), so an
-- anonymous session gets a hard permission-denied at the table-privilege level instead.
create policy "accepted friends can read shared stats"
  on public.shared_stats
  for select
  to authenticated
  using (
    exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and least(auth.uid(), shared_stats.user_id) = f.user_a
        and greatest(auth.uid(), shared_stats.user_id) = f.user_b
    )
  );

-- Explicit grants required regardless of RLS shape -- see 20260818130000_grant_authenticated_table_
-- access.sql's comment: without a base table grant, Postgres denies before RLS is even evaluated,
-- and the legacy auto-expose default this used to paper over is being removed 2026-10-30. Every
-- migration creating a table from here on grants explicitly rather than relying on that default.
grant select, insert, update, delete on public.shared_stats to authenticated;
grant select, insert, update, delete on public.shared_stats to service_role;
