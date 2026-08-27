-- #202: Supabase performance-advisor cleanup. Refactor only -- no access-control semantics change.
-- Verified via local pgTAP before/after (see PR description): same file/test count, all green.
--
-- 1. auth_rls_initplan (20 policies): every RLS policy on every table wraps auth.uid() as a plain
--    function call, which Postgres's planner cannot treat as stable-per-statement -- it gets
--    re-evaluated for every row scanned, not just once per query. Wrapping it as `(select auth.uid())`
--    lets the planner treat it as an initplan, evaluated once and reused
--    (https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select).
--    Every occurrence of a bare `auth.uid()` in every policy's USING/WITH CHECK is wrapped below --
--    enumerated from `pg_policies` directly (not assumed from the issue's own "~21" estimate): 20
--    policies total, all of which had at least one bare `auth.uid()` call -- WITH ONE DELIBERATE
--    EXCEPTION, "participants can read their friendships" (see its own comment below), which stays
--    unwrapped because wrapping it breaks a real query path.
-- 2. unindexed_foreign_keys (4): friendships.requested_by, friendships.user_b, pings.sender_id,
--    pings.receiver_id all reference auth.users with no covering index. friendships' primary key
--    (user_a, user_b) already covers user_a as a leading column but not user_b or requested_by alone;
--    pings has no index at all beyond its own id primary key.
-- 3. multiple_permissive_policies (shared_stats, SELECT): "owners manage their own shared stats"
--    (FOR ALL) and "accepted friends can read shared stats" (FOR SELECT) are both permissive and both
--    apply to every SELECT, so Postgres evaluates and ORs both on every read. Consolidated into one
--    SELECT policy (owner OR accepted friend) plus three command-specific owner-only policies
--    (insert/update/delete) replacing the old ALL policy -- CREATE POLICY has no "ALL except SELECT"
--    shorthand, so splitting is the only way to drop the redundant SELECT arm without changing who
--    can do what. Effective access is unchanged: an owner still has full CRUD on their own row; an
--    accepted friend still gets read-only access; everyone else still gets nothing.

-- === 1. auth_rls_initplan: wrap every bare auth.uid() as (select auth.uid()) ===

alter policy "delete own favorite halls" on public.favorite_dining_halls
  using ((select auth.uid()) = user_id);

alter policy "insert own favorite halls" on public.favorite_dining_halls
  with check ((select auth.uid()) = user_id);

alter policy "select own favorite halls" on public.favorite_dining_halls
  using ((select auth.uid()) = user_id);

alter policy "update own favorite halls" on public.favorite_dining_halls
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "users manage their own favorited foods" on public.favorited_foods
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "users can mark their own food sightings read" on public.food_sightings
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "users read their own food sightings" on public.food_sightings
  using ((select auth.uid()) = user_id);

alter policy "participants can delete their friendships" on public.friendships
  using ((select auth.uid()) = user_a or (select auth.uid()) = user_b);

alter policy "participants can insert their own pending search requests" on public.friendships
  with check (
    (select auth.uid()) = requested_by
    and ((select auth.uid()) = user_a or (select auth.uid()) = user_b)
    and status = 'pending'
    and confirmed_a is null
    and confirmed_b is null
    and origin = 'search'
    and (
      profile_is_discoverable(case when user_a = (select auth.uid()) then user_b else user_a end)
      or exists (
        select 1 from friendships f
        where f.user_a = friendships.user_a and f.user_b = friendships.user_b
      )
    )
  );

-- DELIBERATELY NOT WRAPPED. "participants can insert their own pending search requests" (above)
-- has an idempotent-exemption arm that runs `exists (select 1 from friendships f where ...)` --
-- a self-referencing subquery on friendships, evaluated under this SAME select policy. Wrapping
-- THIS policy's auth.uid() as `(select auth.uid())` while that self-reference exists makes Postgres
-- throw `ERROR: infinite recursion detected in policy for relation "friendships"` on every
-- request_friendship() call and every raw insert -- confirmed empirically (isolated in a scratch
-- transaction: reverting only this one ALTER POLICY, with every other policy in this migration
-- still wrapped, is what turns the failing suite back to fully green; the initplan wrap is
-- self-contained everywhere else in this migration, this is the one spot where it collides with an
-- existing self-referencing query on the same table). No other policy in this schema references its
-- own table, so this is a one-off, not a sign the pattern is broadly unsafe. Left bare on purpose --
-- do not "fix" this to match the others without re-running the full pgTAP suite first.
--
-- Considered and rejected: routing the idempotency `exists` through a SECURITY DEFINER helper
-- (the pattern `profile_is_discoverable`/`search_profiles` already use), which bypasses RLS and
-- would let this policy wrap cleanly too. Rejected because that OR-arm is exactly where #314 had a
-- live exploit (a correlated-subquery bug that turned it into a tautology); changing its evaluation
-- context (caller RLS vs. definer-bypassed) in what's supposed to be a performance-only PR is the
-- wrong place to take on that risk. Leaving auth.uid() bare here is strictly safer than that swap.
alter policy "participants can update their friendships" on public.friendships
  using (
    ((select auth.uid()) = user_a or (select auth.uid()) = user_b)
    and (status = 'accepted' or requested_by <> (select auth.uid()))
  )
  with check ((select auth.uid()) = user_a or (select auth.uid()) = user_b);

alter policy "friends can send pings" on public.pings
  with check (
    (select auth.uid()) = sender_id
    and exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and least(pings.sender_id, pings.receiver_id) = f.user_a
        and greatest(pings.sender_id, pings.receiver_id) = f.user_b
    )
  );

alter policy "participants can read their pings" on public.pings
  using ((select auth.uid()) = sender_id or (select auth.uid()) = receiver_id);

alter policy "senders can retract their pings" on public.pings
  using ((select auth.uid()) = sender_id);

alter policy "profiles readable by self or existing relationship" on public.profiles
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from friendships f
      where least((select auth.uid()), profiles.user_id) = f.user_a
        and greatest((select auth.uid()), profiles.user_id) = f.user_b
    )
  );

alter policy "users update their own profile" on public.profiles
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "users manage their own push tokens" on public.push_tokens
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "owner reads own qr token" on public.qr_tokens
  using ((select auth.uid()) = user_id);

-- shared_stats' two policies are handled below, alongside the dedup (section 3) -- rewriting them
-- twice (once here, once there) would be pointless churn.

-- === 2. unindexed_foreign_keys: 4 missing FK indexes ===

create index if not exists friendships_requested_by_idx on public.friendships (requested_by);
create index if not exists friendships_user_b_idx on public.friendships (user_b);
create index if not exists pings_sender_id_idx on public.pings (sender_id);
create index if not exists pings_receiver_id_idx on public.pings (receiver_id);

-- === 3. multiple_permissive_policies: dedupe shared_stats' two permissive SELECT policies ===
-- (also wraps auth.uid() per section 1 -- these are new policies, not ALTER, since the old ALL
-- policy is being split into per-command policies).

drop policy "owners manage their own shared stats" on public.shared_stats;
drop policy "accepted friends can read shared stats" on public.shared_stats;

create policy "owners and accepted friends can read shared stats" on public.shared_stats
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and least((select auth.uid()), shared_stats.user_id) = f.user_a
        and greatest((select auth.uid()), shared_stats.user_id) = f.user_b
    )
  );

create policy "owners insert their own shared stats" on public.shared_stats
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "owners update their own shared stats" on public.shared_stats
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "owners delete their own shared stats" on public.shared_stats
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
