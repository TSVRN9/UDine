-- #184 security review rework (findings reproduced against the local stack with real attacking
-- SQL -- see PR #204's review). Same convention as 20260821090000_fix_friendships_self_accept.sql:
-- a follow-up migration on top of 20260824150000, not an edit to it, even though neither has ever
-- touched the live project.

-- ---------------------------------------------------------------------------------------------
-- Finding 1 (BLOCKER): both-confirm is bypassable. The friendships_qr_needs_both_confirms CHECK
-- only forbids status='accepted' without both timestamps -- it says nothing about WHO may set
-- those timestamps. A participant who is not requested_by (so the self-accept USING guard doesn't
-- catch them -- that guard only blocks the REQUESTER) can run a single raw UPDATE setting
-- confirmed_a, confirmed_b, AND status='accepted' themselves, on the OTHER party's behalf, with no
-- second person ever confirming anything. Reproduced by the reviewer: the code owner (not
-- requested_by on a qr-origin row) did exactly this and read the scanner's shared_stats.
--
-- Fixed the same way profiles.email is locked down in 20260824150000: column-level GRANT, not a
-- policy WITH CHECK (which can't cheaply compare old-vs-new per-column ownership the way a plain
-- grant can). confirmed_a/confirmed_b become writable ONLY by security-definer function bodies
-- (confirm_friendship), which run as the table owner and are not subject to grantee column
-- privileges at all -- same mechanism, same reason redeem_qr_token can read another user's
-- qr_tokens row. `status` and `requested_by` stay grantable: `status` because the existing
-- search-flow accept (`update friendships set status = 'accepted' ...`,
-- friends.tsx/add-friends.tsx) still needs to write it directly, and `requested_by` because
-- 08_friendships_no_self_accept.sql's two-field-forge case (mallory rewriting requested_by to bob
-- in the same statement as the status flip) is specifically testing that the USING clause -- not a
-- missing column grant -- is what neutralizes that forge; narrowing requested_by's grant away would
-- change that assertion's failure mode instead of leaving it alone. The self-accept USING guard +
-- the both-confirm CHECK constraint together are what keep `status` safe (a participant can still
-- flip it, but only when the CHECK's own confirm requirement is independently satisfiable -- which,
-- with confirmed_a/b now locked down, it no longer is for a qr-origin row without
-- confirm_friendship actually running twice).
revoke update on public.friendships from authenticated;
grant update (status, requested_by) on public.friendships to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Finding 2 (BLOCKER) + #214: the discoverability guard and the "must start pending" guard both
-- lived only in request_friendship's function body -- a raw INSERT (PostgREST's auto-exposed
-- `/friendships` endpoint, not the RPC) skips the function entirely. Reproduced: (a) a raw insert
-- targeting a discoverable=false user's pair landed a row in her inbox AND made her profile
-- (including the new email column) readable via the SELECT policy's "existing relationship" arm;
-- (b) a raw insert with status='accepted' directly forged an accepted friendship with no accept
-- step at all -- the exact #126 exploit shape, just via INSERT instead of UPDATE this time.
--
-- Moved into the INSERT policy's WITH CHECK, which every INSERT must satisfy regardless of which
-- code path issues it (unlike the old policy, which only checked requested_by/participant-ness):
-- must start 'pending' with both confirm columns unset, must be origin='search' (an origin='qr' row
-- may ONLY ever come from redeem_qr_token, which is security definer and bypasses this policy
-- entirely -- a raw insert claiming origin='qr' without ever having redeemed a real token is
-- exactly the kind of forgery this closes), and the other participant must currently be
-- discoverable. request_friendship's own pre-check becomes defense-in-depth, not the only gate.
drop policy "participants can insert their own friend requests" on public.friendships;

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
    and exists (
      select 1 from public.profiles p
      where p.user_id = (case when user_a = auth.uid() then user_b else user_a end)
        and p.discoverable = true
    )
  );

-- ---------------------------------------------------------------------------------------------
-- Finding 3: profiles.email was only backfilled going forward (the recreated handle_new_user
-- trigger); any profiles row that existed before this migration keeps email = null forever. A
-- one-time catch-up for whatever's already there (a no-op on this repo's local test dbs, which
-- have no pre-existing rows at migration time -- this line matters for the live project, which
-- does, once this PR is applied there per the usual owner-gated process).
update public.profiles p set email = u.email from auth.users u where p.user_id = u.id and p.email is null;

-- ---------------------------------------------------------------------------------------------
-- Finding 4: TRUNCATE isn't covered by "select, insert, update, delete" grants, isn't gated by RLS
-- at all (RLS only ever filters rows for SELECT/UPDATE/DELETE/INSERT, never TRUNCATE), and turned
-- out to be reachable anyway -- the reviewer truncated qr_tokens as plain `authenticated`. Every
-- other table in this schema is equally exposed in principle; qr_tokens is the one actually flagged
-- so it's the one fixed here (see PR body for the "should this be swept across every table"
-- follow-up note).
revoke truncate on public.qr_tokens from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Finding 5 (nit): same convention as 20260817220100/20260821120100 -- a security-definer function
-- meant to be called only through specific, checked paths shouldn't also be sitting on
-- PostgREST's auto-exposed RPC endpoint for `anon`. mint_qr_token/redeem_qr_token/confirm_friendship
-- are meant for `authenticated` only (an anonymous scanner can't have a friendship to redeem into
-- anyway -- `auth.uid()` would be null and each function already raises on that, but there's no
-- reason to leave the surface reachable at all).
revoke execute on function public.mint_qr_token() from anon, public;
revoke execute on function public.redeem_qr_token(uuid) from anon, public;
revoke execute on function public.confirm_friendship(uuid) from anon, public;

-- ---------------------------------------------------------------------------------------------
-- Reviewer's one-liner, decided and documented per the review's own instruction: a redeemed-but-
-- never-confirmed qr-origin row (pending, confirmed_a and confirmed_b both still null) grants the
-- scanner permanent profile visibility via the SELECT policy's "existing relationship" arm (any
-- friendships row, any status), and today there's no UI surfacing it if the scan-confirm screen is
-- ever backgrounded/killed before either side taps ADD or CANCEL.
--
-- DECISION: leave the SELECT policy's relationship arm covering pending rows (not narrowed to
-- accepted-only), and treat this as an expiry/cleanup gap instead -- not a visibility bug. Reasons:
-- (1) the SAME "pending grants visibility" shape already exists, deliberately, for the search flow
-- (REQUESTS FOR YOU / SENT need to render the other person's name+email before anyone has
-- accepted), so narrowing it for qr-origin rows only would be an inconsistent carve-out for a
-- mechanism that's supposed to behave the same regardless of origin; (2) narrowing SELECT to
-- accepted-only would break the scan-confirm screen itself, which reads the other party's profile
-- specifically WHILE the row is still pending (#210's qr-confirm.tsx). The actual gap is that a
-- redeemed-never-confirmed row has no expiry and no UI path back to it if the app is killed
-- mid-flow -- tracked as a follow-up (not fixed in this PR, which is schema/RPC only): either give
-- qr-origin pending rows their own short TTL cleanup (mirroring qr_tokens' own 5-minute expiry) or
-- surface abandoned ones in the Add Friends screen's Sent/Requests sections so CANCEL is reachable
-- without relying on the confirm screen still being on screen.
