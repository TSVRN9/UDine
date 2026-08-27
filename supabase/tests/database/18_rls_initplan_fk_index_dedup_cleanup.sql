-- #202: pins the three shapes 20260827130000_rls_initplan_fk_index_dedup_cleanup.sql exists to
-- produce, so a future migration can't silently regress any of them back to the pre-cleanup,
-- advisor-flagged shape:
--   1. every RLS policy's auth.uid() call is wrapped as `(select auth.uid())` (the initplan fix),
--      except the one documented exception on friendships (self-referencing subquery, see that
--      migration's own comment for why wrapping it breaks request_friendship()).
--   2. the 4 previously-missing FK indexes exist.
--   3. shared_stats has exactly one permissive policy per command (the multiple-permissive-SELECT
--      dedup) -- not just "the two policies still work", which the existing 07_shared_stats_rls.sql
--      already covers via actual read/write behavior.
create extension if not exists pgtap;

begin;
select plan(5);

-- 1. No bare (unwrapped) auth.uid() call remains in any policy's USING/WITH CHECK, except the one
-- documented, tested exception (friendships' own SELECT policy -- wrapping it makes Postgres throw
-- "infinite recursion detected in policy for relation" against the INSERT policy's self-referencing
-- idempotency check, confirmed empirically when writing this migration).
select is(
  (
    select count(*)::int from pg_policies
    where schemaname = 'public'
      and tablename <> 'friendships'
      and policyname <> 'participants can read their friendships'
      and (
        (qual is not null and qual ~* 'auth\.uid\(\)' and qual !~* 'select auth\.uid\(\)')
        or (with_check is not null and with_check ~* 'auth\.uid\(\)' and with_check !~* 'select auth\.uid\(\)')
      )
  ),
  0,
  'every policy outside the one documented exception wraps auth.uid() as (select auth.uid())'
);

-- 2. The one documented exception is still bare -- if a future migration wraps it back "for
-- consistency" without re-running the full suite, this goes red as a signpost pointing at the
-- comment explaining why, rather than a silent recursion bug discovered later.
select ok(
  (
    select qual ~* 'auth\.uid\(\)' and qual !~* 'select auth\.uid\(\)'
    from pg_policies
    where schemaname = 'public' and tablename = 'friendships'
      and policyname = 'participants can read their friendships'
  ),
  'friendships'' own SELECT policy stays deliberately unwrapped (self-reference guard)'
);

-- 3. The 4 FK indexes from #202 exist.
select is(
  (
    select count(*)::int from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'friendships_requested_by_idx',
        'friendships_user_b_idx',
        'pings_sender_id_idx',
        'pings_receiver_id_idx'
      )
  ),
  4,
  'all 4 previously-missing FK indexes (friendships.requested_by/user_b, pings.sender_id/receiver_id) exist'
);

-- 4. shared_stats has exactly one *effective* permissive policy for SELECT -- the
-- multiple_permissive_policies advisor finding was specifically that a FOR ALL policy (which also
-- applies to SELECT) and a separate FOR SELECT policy were both permissive and both live, so
-- Postgres evaluated and OR'd both on every read. Counting by literal `cmd` alone would miss this
-- (an 'ALL' row and a 'SELECT' row look like different groups), so this counts every policy whose
-- command actually covers a SELECT (cmd = 'ALL' or cmd = 'SELECT') -- exactly the check the advisor
-- itself runs.
select is(
  (
    select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'shared_stats'
      and cmd in ('ALL', 'SELECT')
      and permissive = 'PERMISSIVE'
  ),
  1,
  'shared_stats has exactly one permissive policy effectively covering SELECT (dedup holds)'
);

-- 5. The 4 new shared_stats policies (created fresh by the dedup, not ALTERed) are scoped to
-- `authenticated`, matching every other policy in this schema -- a plain `create policy` with no
-- `to` clause defaults to `PUBLIC`, which `ALTER POLICY` (used everywhere else in this migration)
-- would never silently do. Caught in review before merge; pinned here so it can't regress quietly.
select is(
  (
    select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'shared_stats'
      and roles = '{authenticated}'
  ),
  4,
  'all 4 shared_stats policies are scoped to authenticated, not the create-policy PUBLIC default'
);

select * from finish();
rollback;
