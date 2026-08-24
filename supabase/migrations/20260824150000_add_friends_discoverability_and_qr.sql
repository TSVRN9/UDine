-- #184: Add Friends surface -- search + "findable by search" toggle + in-person QR with
-- both-confirm. Three additions, kept as separate concerns:
--   1. profiles.discoverable -- an opt-out flag gating the search path only. Direct profile access
--      for an existing relationship (any friendships row, pending or accepted) is untouched, so
--      revoking discoverability can never break an existing friendship or in-flight request.
--   2. profiles.email -- denormalized from auth.users (search needs to match "name or @umass.edu
--      email", and the artboard shows email on every result row) -- owner-writable columns are
--      locked down via column GRANT so a user can't spoof someone else's email into search.
--   3. qr_tokens + friendships.origin/confirmed_a/confirmed_b -- short-lived per-user QR tokens and
--      the both-confirm state machine for the in-person add flow, kept fully separate from the
--      existing search-based request_friendship/accept path (new columns, new RPCs, existing flow's
--      columns/behavior untouched -- 02_request_friendship.sql, 03_friendships_rls.sql, and
--      08_friendships_no_self_accept.sql all keep passing unmodified).

-- ---------------------------------------------------------------------------------------------
-- 1 & 2. discoverable + email
-- ---------------------------------------------------------------------------------------------

alter table public.profiles add column discoverable boolean not null default true;
-- Nullable, no default -- an absent email is an honest "the trigger hasn't backfilled this row",
-- never a silently-stored lie (a `default ''` would render as a false-positive empty match).
alter table public.profiles add column email text;

-- handle_new_user recreated (same trigger, same signature) to also backfill email on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, email)
  values (new.id, split_part(new.email, '@', 1), new.email);
  return new;
end;
$$;

-- RLS-scoped select replaces the old "any signed-in user" blanket policy: self, always; an existing
-- relationship (any friendships row, any status -- pending or accepted), always, so revoking
-- discoverability can never un-render an existing request or friend; otherwise only if discoverable.
-- This is the enforcement boundary the search path (a plain client-side ilike select, see
-- mobile/src/app/add-friends.tsx) relies on -- no separate search RPC needed, the same select just
-- comes back filtered.
drop policy "profiles are readable by any signed-in user" on public.profiles;

create policy "profiles readable by self, existing relationship, or if discoverable"
  on public.profiles for select
  to authenticated
  using (
    auth.uid() = user_id
    or discoverable = true
    or exists (
      select 1 from public.friendships f
      where least(auth.uid(), profiles.user_id) = f.user_a
        and greatest(auth.uid(), profiles.user_id) = f.user_b
    )
  );

-- Column-level lockdown: display_name/notifications_enabled/discoverable stay owner-editable
-- (unchanged from before), but email must only ever come from the signup trigger -- otherwise any
-- user could UPDATE their own profiles.email to someone else's @umass.edu address and have search
-- (and the scan-confirm screen, which presents email as verified identity) show a spoofed address.
revoke update on public.profiles from authenticated;
grant update (display_name, notifications_enabled, discoverable) on public.profiles to authenticated;

-- request_friendship (recreated, same signature): now also rejects targeting a non-discoverable
-- stranger -- "Off = no one can find or request you here" means no *remote* request either, not
-- just absence from search results. Only guards a genuinely new relationship: if any friendships
-- row already exists for the pair (pending or accepted, from back when the target was discoverable,
-- or from the target friending the caller first), the existing on-conflict-do-nothing/idempotent
-- behavior is untouched, so this can't retroactively break a friendship that already exists.
create or replace function public.request_friendship(target_user_id uuid)
returns public.friendships
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  a uuid;
  b uuid;
  result public.friendships;
begin
  if me is null then
    raise exception 'must be signed in';
  end if;
  if me = target_user_id then
    raise exception 'cannot friend yourself';
  end if;

  a := least(me, target_user_id);
  b := greatest(me, target_user_id);

  if not exists (select 1 from public.friendships where user_a = a and user_b = b)
     and not exists (select 1 from public.profiles where user_id = target_user_id and discoverable = true) then
    raise exception 'this user is not accepting friend requests';
  end if;

  insert into public.friendships (user_a, user_b, status, requested_by)
  values (a, b, 'pending', me)
  on conflict (user_a, user_b) do nothing
  returning * into result;

  if result is null then
    select * into result from public.friendships where user_a = a and user_b = b;
  end if;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. QR tokens + both-confirm in-person add
-- ---------------------------------------------------------------------------------------------

-- One active token per user -- minting replaces the previous token outright (also how "code
-- refreshes every 5 minutes" reads naturally: re-mint on an interval, old code just stops working).
-- No insert/update/delete grant to `authenticated` below: writes only ever happen through
-- mint_qr_token()'s security-definer body, same "all inserts via RPC" convention as friendships.
create table public.qr_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '5 minutes')
);

alter table public.qr_tokens enable row level security;

create policy "owner reads own qr token"
  on public.qr_tokens for select
  to authenticated
  using (auth.uid() = user_id);

grant select on public.qr_tokens to authenticated;
grant select, insert, update, delete on public.qr_tokens to service_role;

-- friendships gains: which flow created the row, and each side's explicit in-person confirmation.
-- origin defaults 'search' so every existing/future request_friendship-created row is unaffected;
-- only redeem_qr_token below ever writes 'qr'.
alter table public.friendships add column origin text not null default 'search' check (origin in ('search', 'qr'));
alter table public.friendships add column confirmed_a timestamptz;
alter table public.friendships add column confirmed_b timestamptz;

-- The actual both-confirm guarantee lives HERE, not in RPC discipline alone: a qr-origin row can
-- never read status = 'accepted' unless both confirm columns are set, full stop, regardless of
-- which policy or function issues the UPDATE. (search-origin rows are untouched by this constraint
-- -- confirmed_a/b simply stay null for them, same single-side-accept semantics as before.)
alter table public.friendships add constraint friendships_qr_needs_both_confirms
  check (status <> 'accepted' or origin <> 'qr' or (confirmed_a is not null and confirmed_b is not null));

-- mint_qr_token: security definer purely so the upsert can bypass "no insert/update grant" above --
-- the caller can only ever mint their OWN token (auth.uid(), not a parameter), so this grants no
-- more power than a plain owner-scoped RPC would.
create or replace function public.mint_qr_token()
returns public.qr_tokens
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  result public.qr_tokens;
begin
  if me is null then
    raise exception 'must be signed in';
  end if;

  insert into public.qr_tokens (user_id, token, expires_at)
  values (me, gen_random_uuid(), now() + interval '5 minutes')
  on conflict (user_id) do update set token = excluded.token, expires_at = excluded.expires_at
  returning * into result;

  return result;
end;
$$;

grant execute on function public.mint_qr_token() to authenticated;

-- redeem_qr_token: security definer -- the scanner is never the token's owner, so this is the one
-- place a qr_tokens row is read across users. Deliberately does NOT check profiles.discoverable:
-- the artboard's own footer ("this works even with search off ... handing someone your code is the
-- consent") makes in-person add an explicit, separate consent channel from search-discoverability.
-- Not a one-shot token: a still-valid (un-expired) code can be redeemed by more than one scanner in
-- its 5-minute window (e.g. showing one code to a small group) -- "not replayable" is enforced as
-- "not usable past expires_at", not "usable exactly once". Each redemption creates/returns the
-- (scanner, owner) pair's own canonically-ordered friendships row, same as request_friendship.
create or replace function public.redeem_qr_token(scanned_token uuid)
returns public.friendships
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

  return result;
end;
$$;

grant execute on function public.redeem_qr_token(uuid) to authenticated;

-- confirm_friendship: security definer, deliberately -- the existing "participants can update their
-- friendships" USING clause (20260821090000_fix_friendships_self_accept.sql) blocks the REQUESTER
-- from updating their own still-pending row at all, which for a qr-origin row is the scanner (the
-- one who called redeem_qr_token) -- exactly the person who also needs to confirm. Bypassing RLS
-- here is safe because the function does its own participant check, only ever touches the caller's
-- OWN confirm column, and is scoped to origin = 'qr' rows -- it cannot be used to accept a
-- search-origin request early (that stays single-side-accept, via the existing UPDATE path).
create or replace function public.confirm_friendship(other_user_id uuid)
returns public.friendships
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  a uuid;
  b uuid;
  result public.friendships;
begin
  if me is null then
    raise exception 'must be signed in';
  end if;
  if me = other_user_id then
    raise exception 'cannot confirm yourself';
  end if;

  a := least(me, other_user_id);
  b := greatest(me, other_user_id);

  update public.friendships
  set confirmed_a = case when user_a = me then now() else confirmed_a end,
      confirmed_b = case when user_b = me then now() else confirmed_b end,
      updated_at = now()
  where user_a = a and user_b = b and origin = 'qr'
  returning * into result;

  if result is null then
    raise exception 'no pending in-person request to confirm';
  end if;

  if result.confirmed_a is not null and result.confirmed_b is not null and result.status <> 'accepted' then
    update public.friendships set status = 'accepted', updated_at = now()
    where user_a = a and user_b = b
    returning * into result;
  end if;

  return result;
end;
$$;

grant execute on function public.confirm_friendship(uuid) to authenticated;
