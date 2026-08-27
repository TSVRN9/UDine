-- #250 (item 1): redeem_qr_token's on-conflict-do-nothing hand-back returns the pair's existing
-- friendships row regardless of status/origin -- scanning an already-accepted friend's code (added
-- via search, or a friend re-scanning after both sides already confirmed a prior in-person add)
-- got the exact same successful-looking row back as a genuinely fresh in-person request. The
-- client had no way to tell the two apart short of inspecting `status` itself, and nothing did --
-- add-friend-qr.tsx just forwarded userId to qr-confirm.tsx either way, which then offers a
-- doomed ADD (confirm_friendship raises "no pending in-person request to confirm" for anything
-- that isn't an unconfirmed origin='qr' row) and a CANCEL that silently no-ops (cancelQrFriendRequest
-- is deliberately scoped to status='pending'/origin='qr' only, see its own #236 doc comment) --
-- exactly the dead end #250 describes.
--
-- Fix: signal "already friends" on the hand-back so qr-confirm.tsx can render that state honestly
-- instead of offering a broken add flow. `returns public.friendships` can't carry an extra field,
-- and `create or replace` can't change a function's return type, so this drops and recreates --
-- both the execute grant (20260824150000) and the anon/public revoke (20260824160000) are
-- re-applied below, since a drop discards them.
--
-- Shape: `returns jsonb`, body returns `to_jsonb(result) || jsonb_build_object('already_friends',
-- ...)`. PostgREST returns a scalar-returning (json/jsonb) RPC's result as the raw JSON value
-- itself, not wrapped in a rowset -- so every existing friendships field the client already reads
-- off `data` (add-friend-qr.tsx's `otherUserId(friendship, myId)` needs `user_a`/`user_b` at the
-- top level) stays exactly where it was; `already_friends` is just a new sibling key. Only
-- status = 'accepted' counts as "already friends", either origin -- a still-pending hand-back
-- (either a re-scan before both sides confirm, or an unrelated pending search request) is left on
-- the existing path, unchanged; that's not this ticket's dead end.
drop function public.redeem_qr_token(uuid);

create function public.redeem_qr_token(scanned_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  target uuid;
  a uuid;
  b uuid;
  result public.friendships;
begin
  if me is null then
    raise exception 'must be signed in';
  end if;

  select user_id into target from public.qr_tokens where token = scanned_token and expires_at > now();
  if target is null then
    raise exception 'invalid or expired code';
  end if;
  if target = me then
    raise exception 'cannot add yourself';
  end if;

  a := least(me, target);
  b := greatest(me, target);

  insert into public.friendships (user_a, user_b, status, requested_by, origin)
  values (a, b, 'pending', me, 'qr')
  on conflict (user_a, user_b) do nothing
  returning * into result;

  if result is null then
    select * into result from public.friendships where user_a = a and user_b = b;
  end if;

  return to_jsonb(result) || jsonb_build_object('already_friends', result.status = 'accepted');
end;
$$;

grant execute on function public.redeem_qr_token(uuid) to authenticated;
revoke execute on function public.redeem_qr_token(uuid) from anon, public;
