-- #227: any authenticated user could bulk-scrape every discoverable profile's real @umass.edu
-- email via the raw PostgREST /profiles endpoint. Root cause: 20260818130000 granted table-wide
-- SELECT on profiles to authenticated, and 20260824150000's SELECT policy has a
-- `discoverable = true` arm with no row cap and no query predicate (discoverable defaults true),
-- so a stranger's unfiltered `select display_name, email, notifications_enabled, created_at from
-- profiles` returned the whole opted-in userbase as a name->email map. Neither migration has been
-- applied to the live project (owner-gated, see CLAUDE.md), so this is fixed before it ever ships.
--
-- Deliberately NOT touching the SELECT policy's `discoverable = true` arm. It's load-bearing for
-- two things outside this bug's scope: request_friendship's own
-- `exists (select 1 from profiles where user_id = target_user_id and discoverable = true)` check
-- (security invoker -- runs under the CALLER's RLS) and the friendships INSERT policy's identical
-- subquery (20260824160000, also evaluated under the caller's RLS since profiles has RLS enabled).
-- Both need a genuine stranger's discoverable flag to be selectable pre-relationship, or "request a
-- stranger who opted into search" breaks outright. See 11_profile_search_lockdown.sql's own
-- regression test, which ablates the arm and watches both die, as the encoded evidence for this.
--
-- Part 1 -- column-level lockdown, same mechanism 20260824150000/20260824160000 already used for
-- profiles.email UPDATE and friendships.confirmed_a/b UPDATE: revoke email and created_at from the
-- table-wide SELECT grant entirely.
--   - email is the actual PII this bug is about: an authoritative, unique-identifying @umass.edu
--     address, unlike a changeable display_name.
--   - created_at (profiles' signup timestamp -- NOT friendships.created_at, a different column on a
--     different table, untouched) has zero legitimate read call site anywhere in mobile/ or web/
--     today. Free win.
--   - notifications_enabled is deliberately KEPT on the grant. Its only read call sites
--     (favoriteFoodAlerts.ts:75, web/src/routes/notifications/+page.svelte:133) are self-only, and
--     column-level GRANT can't be scoped to "only the caller's own row" the way RLS can -- doing the
--     same treatment for it would mean rerouting those two self-reads through an RPC too, which is
--     more than #227 asks for. The residual stranger-readable surface is a boolean toggle, not an
--     identity. service_role (check-favorited-foods) is untouched -- its own table-wide grant from
--     20260818130000 already covers every column and this migration only revokes from
--     `authenticated`.
--
-- Residual, ACCEPTED exposure after this migration: `select user_id, display_name,
-- notifications_enabled, discoverable from profiles` still succeeds, unbounded, for every
-- discoverable=true row -- column grants can't add a row cap, and the discoverable=true policy arm
-- is unchanged (see above). This is the intended surface of an opt-in-to-search feature with an
-- opt-out default, and is exactly why the discoverable default matters -- #227 raises, and this
-- migration deliberately does NOT decide, whether `discoverable` should default to false. Owner
-- call, see PR body.
revoke select on public.profiles from authenticated;
grant select (user_id, display_name, notifications_enabled, discoverable) on public.profiles to authenticated;

-- Part 2 -- two SECURITY DEFINER RPCs so the app's own legitimate email reads still work despite
-- the grant now denying email/created_at outright. SECURITY DEFINER functions run as the table
-- owner and aren't subject to the caller's column privileges at all -- same reason
-- mint_qr_token/redeem_qr_token/confirm_friendship already bypass their own tables' narrowed grants.

-- search_profiles: replaces add-friends.tsx's two raw .ilike() calls (mobile/src/app/add-friends.tsx,
-- from #210). A 0/1-char term returns empty rather than raising -- the UI calls this on every
-- keystroke, and a mid-typing exception would surface a raw Postgres error in an Alert. Row-capped
-- at 20, matching the existing client-side .limit(20) budget on each of the two calls it replaces.
-- discoverable=true only, excludes the caller. LIKE metacharacters (%, _) in the term are escaped --
-- a search box is the one place user input reaches an ilike pattern directly, and an unescaped `%`
-- would otherwise widen a "too short to match everyone" term right back into matching everyone.
create or replace function public.search_profiles(term text)
returns table (user_id uuid, display_name text, email text)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  cleaned text := trim(term);
  escaped text;
  me uuid := auth.uid();
begin
  if me is null or cleaned is null or length(cleaned) < 2 then
    return;
  end if;

  escaped := replace(replace(replace(cleaned, '\', '\\'), '%', '\%'), '_', '\_');

  return query
    select p.user_id, p.display_name, p.email
    from public.profiles p
    where p.discoverable = true
      and p.user_id <> me
      and (
        p.display_name ilike '%' || escaped || '%' escape '\'
        or p.email ilike escaped || '%' escape '\'
      )
    order by p.display_name
    limit 20;
end;
$$;

revoke execute on function public.search_profiles(text) from anon, public;
grant execute on function public.search_profiles(text) to authenticated;

-- related_profiles: replaces the two remaining direct email reads that survive an existing
-- relationship -- add-friends.tsx's REQUESTS FOR YOU/SENT profile lookup and qr-confirm.tsx's
-- scanned-profile lookup (a qr-origin friendship row always exists by the time that screen loads,
-- see redeem_qr_token). Self or an existing friendships row (any status) only -- mirrors the SELECT
-- policy's own relationship arm exactly. Silently omits any id that doesn't match rather than
-- erroring, so it can't be used to probe "does a relationship exist" via its error/success shape.
-- Row-capped at 200 defensively, even though the relationship check already bounds it to ids the
-- caller can legitimately reach.
create or replace function public.related_profiles(target_ids uuid[])
returns table (user_id uuid, display_name text, email text)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    return;
  end if;

  return query
    select p.user_id, p.display_name, p.email
    from public.profiles p
    where p.user_id = any(target_ids)
      and (
        p.user_id = me
        or exists (
          select 1 from public.friendships f
          where least(me, p.user_id) = f.user_a
            and greatest(me, p.user_id) = f.user_b
        )
      )
    limit 200;
end;
$$;

revoke execute on function public.related_profiles(uuid[]) from anon, public;
grant execute on function public.related_profiles(uuid[]) to authenticated;
