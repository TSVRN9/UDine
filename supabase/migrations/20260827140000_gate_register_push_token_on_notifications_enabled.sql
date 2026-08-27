-- #277: after #264/#270/#275 the client-side guards against a self-heal re-registering a push
-- token the user just disabled are ordering constraints (await pending self-heal before delete,
-- flip notifications_enabled before the push_tokens delete, etc). #275's review found three
-- narrow residual windows, all the same shape: reregisterPushToken (mobile/src/lib/
-- favoriteFoodAlerts.ts) captures `enabled` once at refresh() time, BEFORE its network round trip
-- to get a fresh Expo token, and never re-reads it before calling this RPC. A Delete confirmed
-- during that round trip lets a stale `true` read re-register the token afterward.
--
-- Fix: since register_push_token is already security definer and already resolves
-- `me := auth.uid()`, it can read profiles.notifications_enabled for that same caller in the same
-- statement and no-op the whole registration (including the evict-and-reassign path -- both are
-- the same `insert ... on conflict` below) when it's false. This closes all three windows on BOTH
-- platforms with no client change: every registration path goes through this RPC (#270's review --
-- zero raw upserts remain; re-checked here, still true as of this migration -- see the PR body).
--
-- Silent no-op (returns null), not a raise: the client's own `if (enabled)` guard around every
-- call site (favoriteFoodAlerts.ts's toggle() and reregisterPushToken()) means this branch only
-- fires inside the race itself -- by the time it does, the user has already turned alerts off, so
-- surfacing an error here would pop a spurious "Couldn't register this device" alert for a register
-- call the user never actually asked to succeed. Both call sites already destructure only `error`
-- (or `rpcError`) off the RPC result and never touch `data`, so a null return needs no client
-- change to be handled safely -- confirmed by re-reading both call sites, not just the old line
-- numbers the issue cites.
--
-- The evicting-caller case is covered by the same guard, not a separate check: an evict-and-
-- reassign is just this same insert-on-conflict landing on a row another user already owns, so a
-- disabled caller is blocked from stealing an enabled owner's token the same way a fresh
-- registration is blocked -- the existing owner's row is left completely untouched because the
-- statement that would have touched it never runs.
create or replace function public.register_push_token(p_platform text, p_token text)
returns public.push_tokens
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  notifications_on boolean;
  result public.push_tokens;
begin
  if me is null then
    raise exception 'must be signed in';
  end if;

  select notifications_enabled into notifications_on
  from public.profiles
  where user_id = me;

  if notifications_on is not true then
    return null;
  end if;

  insert into public.push_tokens (user_id, platform, token)
  values (me, p_platform, p_token)
  on conflict (platform, token) do update set user_id = excluded.user_id
  returning * into result;

  return result;
end;
$$;
