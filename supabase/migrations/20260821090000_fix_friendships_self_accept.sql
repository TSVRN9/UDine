-- PR #126 review (BLOCK, security): "participants can update their friendships"
-- (20260817220000_friends_pings_favorited_foods.sql:78-82) had no guard against the REQUESTER
-- accepting their own pending request. shared_stats' friend-read policy
-- (20260820120000_shared_stats.sql) trusts status = 'accepted', so this pre-existing hole (previously
-- just an unsolicited-pings/harassment vector, per the reviewer's scope check -- status = 'accepted'
-- appears in exactly two policies in the whole schema before this PR: pings' insert policy, and
-- shared_stats' friend-select policy) became a stats-read hole the moment #94 shipped. Red evidence:
-- 08_friendships_no_self_accept.sql, run against the pre-fix policy, reproduces the exploit exactly
-- (mallory sends bob an unsolicited request, accepts it herself, reads bob's shared_stats).
--
-- The guard MUST live in USING, not WITH CHECK. WITH CHECK only evaluates the NEW row, so a
-- same-statement forge (`update ... set status = 'accepted', requested_by = '<victim>' where ...`)
-- satisfies a WITH-CHECK-only guard trivially -- verified directly: a WITH-CHECK-only candidate of
-- this exact fix blocked the plain self-accept but was bypassed by the two-field forge. USING sees
-- the OLD row (before the forge), so it can't be rewritten mid-statement.
--
-- Net effect: once a friendship is 'accepted', either participant can still UPDATE the row (no
-- change from before -- there's currently nothing else to update it for, but nothing here forecloses
-- that). While a friendship is 'pending', only the party who did NOT request it may act on it via
-- UPDATE -- the requester is now unable to UPDATE their own still-pending row at all. Cancelling a
-- sent request is unaffected: that goes through the existing DELETE policy, not UPDATE.
alter policy "participants can update their friendships" on public.friendships
  using (
    (auth.uid() = user_a or auth.uid() = user_b)
    and (status = 'accepted' or requested_by <> auth.uid())
  )
  with check (auth.uid() = user_a or auth.uid() = user_b);
