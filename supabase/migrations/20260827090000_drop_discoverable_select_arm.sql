-- #234: the durable fix for the residual #233 could only narrow. #233 locked down the raw
-- profiles table grant (email/created_at gone) and added search_profiles/related_profiles, but the
-- `discoverable = true` SELECT policy arm (20260824150000) survived, because request_friendship
-- (security invoker) and the friendships INSERT policy (20260824160000, evaluated under the
-- CALLER's RLS since profiles has RLS enabled) both need a genuine stranger's discoverable flag to
-- be selectable pre-relationship.
--
-- That arm alone is still an unbounded directory dump: `select user_id, display_name,
-- notifications_enabled, discoverable from profiles where discoverable = true` returns every
-- opted-in user in one query (column grant from 20260825120000 covers exactly these columns).
-- Combined with search_profiles' own correctly-capped 20-per-term limit, the reviewer measured a
-- seeded 503-user directory: one query for the worklist + 503 search_profiles calls recovered 502
-- real emails (99.8% of the directory) -- name-level enumeration turned into a near-complete email
-- harvest, just spread over more requests than the original #227 bug.
--
-- Fix: reroute both call sites off the caller's RLS entirely, via a SECURITY DEFINER helper (runs
-- as the table owner, which bypasses RLS by default -- same mechanism search_profiles/
-- related_profiles/mint_qr_token/etc. already rely on), then drop the SELECT arm outright. This
-- closes both the unbounded name dump AND the behavioral leak of notifications_enabled/discoverable
-- across the whole userbase -- a stranger's plain `select ... from profiles` now returns zero rows
-- for anyone they don't already have a relationship with, discoverable or not. Directory discovery
-- is only ever reachable through search_profiles' own 20-row cap now.

-- ---------------------------------------------------------------------------------------------
-- 1. profile_is_discoverable: the SECURITY DEFINER helper both call sites route through.
-- ---------------------------------------------------------------------------------------------
create or replace function public.profile_is_discoverable(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles where user_id = target_user_id and discoverable = true
  );
$$;

revoke execute on function public.profile_is_discoverable(uuid) from anon, public;
grant execute on function public.profile_is_discoverable(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. request_friendship: stays SECURITY INVOKER (deliberately -- see below), same signature and
-- body shape, only its discoverability check changes from a direct `profiles` query (which relied
-- on the now-dropped SELECT arm) to a call to the definer helper above. The helper alone is enough
-- to see a stranger's discoverable flag regardless of the caller's own RLS -- making the whole
-- function SECURITY DEFINER too was the issue's original suggestion, but would ALSO make this
-- function's own INSERT bypass the friendships INSERT policy's WITH CHECK entirely (table owners
-- bypass RLS by default; friendships has no FORCE ROW LEVEL SECURITY). That policy is real
-- defense-in-depth, not redundant with this function's body -- #214/#204 hardened it specifically
-- because a raw INSERT (bypassing this RPC) must be independently rejected, and #221/#314 fixed a
-- real bug in its idempotent-exemption arm that a defense-in-depth-blind RPC path would never have
-- caught. Keeping this function as invoker means every insert it makes is still checked against
-- that policy too, so a regression there (e.g. reintroducing #314's tautology) still shows up on
-- this call path, not just the raw-INSERT one.
-- ---------------------------------------------------------------------------------------------
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
     and not public.profile_is_discoverable(target_user_id) then
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
-- 3. friendships INSERT policy: identical shape to 20260826160000 (the #314/#315 tautology fix),
-- only the discoverability arm changes -- direct `exists (select ... from profiles ...)` (evaluated
-- under the caller's RLS) becomes a call to the definer helper. The idempotent-exemption OR-arm
-- (an existing friendships row for this exact pair) is untouched, correlated-subquery fix and all.
-- ---------------------------------------------------------------------------------------------
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
      public.profile_is_discoverable(case when user_a = auth.uid() then user_b else user_a end)
      or exists (
        select 1 from public.friendships f
        where f.user_a = friendships.user_a and f.user_b = friendships.user_b
      )
    )
  );

-- ---------------------------------------------------------------------------------------------
-- 4. profiles SELECT policy: drop the discoverable = true arm entirely. Self and existing
-- relationship (any status) are the only ways left to read a profile row -- discoverability now
-- only ever gates search_profiles (20-row cap, deterministic order) and the two RPCs above.
-- ---------------------------------------------------------------------------------------------
drop policy "profiles readable by self, existing relationship, or if discoverable" on public.profiles;

create policy "profiles readable by self or existing relationship"
  on public.profiles for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friendships f
      where least(auth.uid(), profiles.user_id) = f.user_a
        and greatest(auth.uid(), profiles.user_id) = f.user_b
    )
  );

-- ---------------------------------------------------------------------------------------------
-- 5. Two nits from the same review, folded in here since they touch the same file/reviewer pass:
--    - related_profiles had no ORDER BY, so a caller with >200 relationships got a nondeterministic
--      200 out of the LIMIT.
--    - related_profiles had no cap on the input array length -- not a DoS today (500,000 elements
--      benchmarked at 384ms), but a cheap guard costs nothing: an array longer than the row cap
--      can never return more than `limit` rows anyway, so truncating the input to the same bound
--      up front is free and loses nothing.
-- ---------------------------------------------------------------------------------------------
create or replace function public.related_profiles(target_ids uuid[])
returns table (user_id uuid, display_name text, email text)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  me uuid := auth.uid();
  -- ponytail: positional cap, not relevance-ordered -- a caller-supplied array with real ids past
  -- position 200 loses them. Fine today (every call site builds this array from its own known
  -- relationship/search-result ids, never attacker-controlled order); upgrade to a smarter
  -- pre-filter only if a real batch ever legitimately exceeds 200 ids.
  capped_ids uuid[] := target_ids[1:200];
begin
  if me is null then
    return;
  end if;

  return query
    select p.user_id, p.display_name, p.email
    from public.profiles p
    where p.user_id = any(capped_ids)
      and (
        p.user_id = me
        or exists (
          select 1 from public.friendships f
          where least(me, p.user_id) = f.user_a
            and greatest(me, p.user_id) = f.user_b
        )
      )
    order by p.user_id
    limit 200;
end;
$$;
