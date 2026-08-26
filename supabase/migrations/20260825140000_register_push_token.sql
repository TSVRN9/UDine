-- #263: push_tokens' PK is (user_id, platform, token), so two different users registering the same
-- shared-device token (a family iPad, a kiosk, a phone handed off without a factory reset) both
-- succeed -- server dispatch then has no per-token dedup (_shared/push.ts iterates notifications x
-- that user's tokens), so whoever holds the device gets pushes naming BOTH users' favorites/pings.
-- #257 (mobile) deletes the row client-side on sign-out, which closes the common path, but PR #264's
-- own review kept surfacing cases a client-only guarantee can't cover -- force-quit, a killed app, a
-- second client, a failed write. This migration is the server-side backstop so a stale row is
-- harmless regardless of what the client did.
--
-- A bare `unique (platform, token)` alone would BREAK registration: under RLS a user can only
-- write their own push_tokens rows, so user B registering a token already held by user A would
-- 23505 on the unique violation and B would never get alerts. The fix is a security definer RPC
-- that reassigns the row to the caller via that same unique constraint (`on conflict (platform,
-- token) do update`) -- see register_push_token below for why that's one atomic statement rather
-- than a separate delete-then-insert. The unique constraint is also the backstop that makes a raw
-- insert/upsert (bypassing the RPC) fail loudly instead of silently creating the duplicate this
-- ticket is about.

-- Step 1: dedupe existing rows BEFORE the constraint can be added -- old clients (pre-#263) used a
-- raw upsert with no eviction, so a live/dev DB that's been running that client can already have
-- more than one user holding the same (platform, token). Live has 0 duplicates today (1 token
-- total), but this must be safe to run against a DB that doesn't. Keep the most recently created row
-- per (platform, token); `created_at` is the only ownership timestamp this table has (no
-- `updated_at`), and ties (identical created_at) are broken by `ctid` purely so the comparison is a
-- deterministic total order, not because ctid carries any real recency meaning.
delete from public.push_tokens t
using public.push_tokens newer
where t.platform = newer.platform
  and t.token = newer.token
  and (
    newer.created_at > t.created_at
    or (newer.created_at = t.created_at and newer.ctid > t.ctid)
  );

-- Step 2: the backstop. Anything that reaches this constraint without going through
-- register_push_token() below (a stale raw upsert, a client that didn't switch) fails outright
-- instead of silently creating a second owner for the token.
alter table public.push_tokens
  add constraint push_tokens_platform_token_key unique (platform, token);

-- register_push_token: security definer is required (not a convenience) -- reassigning another
-- user's row to the caller is exactly what the owner-only RLS policy forbids a plain caller from
-- doing, and that reassignment is the entire point.
--
-- One atomic upsert, not a delete-then-insert: an earlier version of this function ran `delete
-- ... where user_id <> me` followed by a separate `insert ... on conflict (user_id, platform,
-- token) do nothing` -- two statements, two round trips through the constraint. Two concurrent
-- callers (B registering A's token, A re-registering it back) could each run their DELETE before
-- either INSERT commits, then both attempt the INSERT, and the second still hits
-- push_tokens_platform_token_key -- the exact 23505 this RPC exists to avoid. A single `insert ...
-- on conflict (platform, token) do update set user_id = excluded.user_id` is race-free: Postgres
-- takes the row lock and resolves the conflict in one statement, so there is no window between
-- "check who owns it" and "write" for a second caller to land in.
create or replace function public.register_push_token(p_platform text, p_token text)
returns public.push_tokens
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  result public.push_tokens;
begin
  if me is null then
    raise exception 'must be signed in';
  end if;

  insert into public.push_tokens (user_id, platform, token)
  values (me, p_platform, p_token)
  on conflict (platform, token) do update set user_id = excluded.user_id
  returning * into result;

  return result;
end;
$$;

revoke execute on function public.register_push_token(text, text) from anon, public;
grant execute on function public.register_push_token(text, text) to authenticated;
