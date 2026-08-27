-- #314: 20260826150000's idempotent-re-request exemption on the friendships INSERT policy
-- ("participants can insert their own pending search requests") has a correlated-subquery
-- name collision. Its OR-arm was written as:
--
--   or exists (
--     select 1 from public.friendships f
--     where f.user_a = user_a and f.user_b = user_b
--   )
--
-- The bare `user_a`/`user_b` on the right-hand side bind to the subquery's own alias `f`
-- (same-named columns) instead of the row being inserted, so Postgres resolves it as
-- `f.user_a = f.user_a and f.user_b = f.user_b` -- a tautology, true for any friendships row
-- visible to the caller under RLS, regardless of the pair actually being inserted. Confirmed via
-- pg_get_expr(polwithcheck, ...) and a live exploit: a user with any unrelated accepted
-- friendship of their own could raw-insert a pending request to a non-discoverable stranger they
-- have zero prior relationship with. This defeats the discoverability opt-out (and effectively
-- the "already exists" gate itself) for every INSERT once the caller can see at least one row.
--
-- Fix: qualify the outer reference explicitly against the table name, not the subquery alias, so
-- the exists() check is scoped to the actual pair being inserted, matching request_friendship()'s
-- own idempotency check.
drop policy "participants can insert their own pending search requests" on public.friendships;

create policy "participants can insert their own pending search requests"
  on public.friendships for insert
  to authenticated
  with check (
    auth.uid() = requested_by
    and (auth.uid() = user_a or auth.uid() = user_b)
    and status = 'pending'
    and confirmed_a is null
    and confirmed_b is null
    and origin = 'search'
    and (
      exists (
        select 1 from public.profiles p
        where p.user_id = (case when user_a = auth.uid() then user_b else user_a end)
          and p.discoverable = true
      )
      or exists (
        select 1 from public.friendships f
        where f.user_a = friendships.user_a and f.user_b = friendships.user_b
      )
    )
  );
