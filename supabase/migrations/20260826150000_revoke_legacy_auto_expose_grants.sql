-- #201: live grants are far wider than every table-specific migration's documented intent -- the
-- legacy Supabase auto-expose default ACL grants anon/authenticated/service_role ALL privileges
-- (DELETE/INSERT/MAINTAIN/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE) on every public-schema table,
-- layered on top of whatever this repo's own migrations explicitly granted. RLS still gates every
-- row for SELECT/INSERT/UPDATE/DELETE (confirmed via `aclexplode`/`attacl` against the local stack:
-- anon has zero legitimate table or column grants from any migration, only the ambient legacy
-- overlay), but TRUNCATE is never RLS-gated at all -- see #221 below -- and REFERENCES/TRIGGER/
-- MAINTAIN have no legitimate PostgREST-reachable use for a non-owner role regardless. The
-- 2026-10-30 auto-expose removal only stops FUTURE tables from getting this overlay; it does
-- nothing for the 9 tables that already exist. Acceptance: local pgTAP (`supabase test db`) stays
-- green after this migration -- it already asserts the intended, narrower permission model.

-- service_role: #201 also names it as holding the same legacy ALL-privileges overlay, but it is
-- deliberately left untouched here. It's the trusted backend role (Edge Functions, cron jobs) --
-- never client-reachable, bypasses RLS by design, and every migration that runs as service_role
-- already relies on it having full table access. Revoking from it would be a functional regression,
-- not a security fix; #201's own acceptance criterion is "local pgTAP stays green," which does not
-- exercise service_role denial anywhere.
--
-- anon: every social table's RLS assumes "anon has zero grants" as its enforcement boundary (see
-- e.g. 05_own_row_tables_rls.sql, 07_shared_stats_rls.sql) -- a plain "anon is a hard permission
-- denied" test on any of these tables was passing against a real ambient anon grant it never
-- actually described. Blanket revoke, plus a default-privileges fix so a future table created
-- before 2026-10-30 (which still gets the legacy auto-expose default) doesn't reintroduce this.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- authenticated: TRUNCATE/REFERENCES/TRIGGER/MAINTAIN are never granted intentionally anywhere in
-- this schema -- every table's real write surface is exactly the CRUD verbs its own migration
-- granted, gated by RLS on top. TRUNCATE is the dangerous one (#221): RLS never gates it, so
-- friendships/pings/profiles/shared_stats were full-table-wipe reachable by ANY signed-in
-- @umass.edu user -- the same shape 20260824160000 already fixed for qr_tokens alone.
-- REFERENCES/TRIGGER/MAINTAIN are schema-administration privileges with no RLS-policy-gated
-- counterpart at all, so leaving them granted has no corresponding "but the policy allows it" case
-- to preserve.
revoke truncate, references, trigger, maintain on all tables in schema public from authenticated;

-- Per-table revokes of excess CRUD verbs beyond what each table's own migration actually grants --
-- derived by diffing live grants (aclexplode(pg_class.relacl)/pg_attribute.attacl on the local
-- stack) against every `grant`/`revoke` statement across supabase/migrations/*.sql, not guessed:
--   profiles:        20260818130000 granted select+update; 20260824150000 and 20260825120000 each
--                     narrowed a table-wide grant to column-level only (update to display_name/
--                     notifications_enabled/discoverable; select to user_id/display_name/
--                     notifications_enabled/discoverable). Table-wide insert/delete were never
--                     granted by any migration -- both excess.
--   pings:            20260818130000 granted select/insert/delete only -- no update policy exists
--                      on this table at all, so table-wide update is excess.
--   food_sightings:   20260818130000 granted select/insert/update only (delete deliberately
--                      omitted, see that migration's own comment) -- table-wide delete is excess.
--   qr_tokens:        20260824150000 granted select only -- deliberately no insert/update/delete
--                      grant at all, every write goes through a security-definer RPC
--                      (mint_qr_token/redeem_qr_token/confirm_friendship) that bypasses grantee
--                      privileges entirely. Table-wide insert/update/delete are all excess; this is
--                      also what 09_discoverable_profiles_and_qr_tokens.sql's own "a raw insert
--                      into qr_tokens is rejected -- no insert grant for authenticated" test
--                      expects (it was failing pre-fix: the ambient grant let the insert reach RLS
--                      and fail with a row-level-security error instead of the permission-denied
--                      the test asserts).
-- friendships (select/insert/delete stay table-wide per 20260818130000, update narrowed to
-- status/requested_by by 20260824160000) and favorited_foods/push_tokens/favorite_dining_halls/
-- shared_stats (full select/insert/update/delete, matching their migrations exactly) have nothing
-- left to revoke beyond the blanket sweep above.
revoke insert, delete on public.profiles from authenticated;
revoke update on public.pings from authenticated;
revoke delete on public.food_sightings from authenticated;
revoke insert, update, delete on public.qr_tokens from authenticated;

-- #201 comment ("server hunt round 2", INFO): request_friendship was the only function in public
-- still EXECUTE-able by anon/PUBLIC -- the other 8 already have this revoke (20260817220100,
-- 20260821120100, 20260824160000 x3, 20260825140000). Harmless today (security invoker, raises on
-- null auth.uid(), and anon now has zero table grants per the revoke above) but inconsistent with
-- the established convention, so folded in here.
revoke execute on function public.request_friendship(uuid) from anon, public;

-- #221's two named destructive-verb tables (friendships/pings/profiles/shared_stats TRUNCATE) are
-- both fully covered by the blanket "all tables in schema public" truncate revoke above -- no
-- separate per-table truncate revoke needed.

-- #221, second and unrelated fix: a one-line RLS policy gap, not a grant. request_friendship's own
-- idempotent "a friendships row already exists for this pair" exemption
-- (20260824150000's function body, and its own comment on the point) is not mirrored in the INSERT
-- policy's WITH CHECK (20260824160000's "participants can insert their own pending search
-- requests"). Postgres evaluates a row's WITH CHECK before ON CONFLICT DO NOTHING gets a chance to
-- resolve it, so re-requesting a pair that already has a friendships row -- once the *other*
-- participant has since turned discoverability off -- raises a raw RLS violation instead of
-- silently no-opping, even though the function body already treats "row already exists" as
-- sufficient regardless of discoverability. Mirror that exemption into the policy's discoverable
-- arm so the two can't disagree.
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
        where f.user_a = user_a and f.user_b = user_b
      )
    )
  );
