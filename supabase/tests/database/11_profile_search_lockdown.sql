-- #227: any authenticated user could bulk-scrape every discoverable profile's real @umass.edu
-- email via the raw PostgREST /profiles endpoint (name->email map, unbounded, zero query needed
-- beyond a valid JWT). Fixed by 20260825120000_lockdown_profile_search.sql: email/created_at
-- dropped from the table-wide SELECT grant, two new SECURITY DEFINER RPCs (search_profiles,
-- related_profiles) carry the app's legitimate email reads instead.
--
-- Per #222's own lesson: every assertion here reads the AMBIENT, already-migrated schema (real
-- has_column_privilege/has_function_privilege/pg_policies state, and the real shipped function
-- bodies) rather than a policy/grant this file re-applies itself inside its own transaction -- a
-- suite that repairs the schema it's testing can't detect a regression in the shipped migration.
-- The one deliberate exception is the regression guard at the bottom, which mutates ON PURPOSE to
-- reproduce and re-close the #234 unbounded-directory-dump exploit (the SELECT policy's
-- discoverable=true arm 20260825120000 deliberately left in place, and 20260827090000 later
-- dropped once request_friendship/the friendships INSERT policy no longer needed it) -- restored
-- before commit, same convention as 09/10's own constraint/policy mutation-red blocks.
create extension if not exists pgtap;

begin;
select plan(48);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@umass.edu',   crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carol@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dave@umass.edu',  crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'erin@umass.edu',  crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'frank@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'grace@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

-- carol is private; everyone else stays discoverable (the default).
update public.profiles set discoverable = false where user_id = '00000000-0000-0000-0000-000000000003';
-- dave: pending relationship with alice (search-origin, alice requested). erin: accepted friend of
-- alice. frank: no relationship with alice at all -- the "silently excluded" case below.
insert into public.friendships (user_a, user_b, status, requested_by) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'pending', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'accepted', '00000000-0000-0000-0000-000000000001');

-- =================================================================================================
-- Ambient grant/policy state -- read BEFORE anything in this file mutates anything, per #222.
-- =================================================================================================

-- (1)-(2) email and created_at are gone from authenticated's column privileges entirely.
select ok(not has_column_privilege('authenticated', 'public.profiles', 'email', 'SELECT'), 'authenticated has no SELECT on profiles.email');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'created_at', 'SELECT'), 'authenticated has no SELECT on profiles.created_at');

-- (3)-(6) the columns every legitimate self/friend/search-result-name read still needs remain.
select ok(has_column_privilege('authenticated', 'public.profiles', 'user_id', 'SELECT'), 'authenticated keeps SELECT on profiles.user_id');
select ok(has_column_privilege('authenticated', 'public.profiles', 'display_name', 'SELECT'), 'authenticated keeps SELECT on profiles.display_name');
select ok(has_column_privilege('authenticated', 'public.profiles', 'notifications_enabled', 'SELECT'), 'authenticated keeps SELECT on profiles.notifications_enabled -- self-only read call sites, see migration comment');
select ok(has_column_privilege('authenticated', 'public.profiles', 'discoverable', 'SELECT'), 'authenticated keeps SELECT on profiles.discoverable');

-- (7) service_role (check-favorited-foods) is untouched -- this migration only revoked from
-- `authenticated`, and 20260818130000's table-wide service_role grant already covered every column.
select ok(has_column_privilege('service_role', 'public.profiles', 'email', 'SELECT'), 'service_role still has SELECT on profiles.email -- check-favorited-foods is unaffected');

-- (8)-(11) EXECUTE on the two new RPCs: authenticated yes, anon no (revoked per the
-- 20260817220100/20260821120100 convention -- newly created functions are PUBLIC-executable by
-- default unless revoked).
select ok(has_function_privilege('authenticated', 'public.search_profiles(text)', 'EXECUTE'), 'authenticated can execute search_profiles');
select ok(not has_function_privilege('anon', 'public.search_profiles(text)', 'EXECUTE'), 'anon cannot execute search_profiles');
select ok(has_function_privilege('authenticated', 'public.related_profiles(uuid[])', 'EXECUTE'), 'authenticated can execute related_profiles');
select ok(not has_function_privilege('anon', 'public.related_profiles(uuid[])', 'EXECUTE'), 'anon cannot execute related_profiles');

-- (12) #234: the SELECT policy's discoverable=true arm is now GONE -- self or existing relationship
-- only. See the regression guard at the bottom of this file for the closed exploit this enables.
select isnt(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles readable by self or existing relationship'),
  null,
  '#234: the narrowed profiles SELECT policy exists'
);
select doesnt_match(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles readable by self or existing relationship'),
  'discoverable',
  '#234: the profiles SELECT policy no longer mentions discoverable at all -- narrowed to self/relationship only'
);
select ok(
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles readable by self, existing relationship, or if discoverable'),
  '#234: the old discoverable-arm policy name is gone'
);

-- (12b) #234: profile_is_discoverable is the SECURITY DEFINER helper both request_friendship's
-- body and the friendships INSERT policy now route through instead of relying on the caller's own
-- RLS. request_friendship itself deliberately STAYS security invoker -- see the migration's own
-- comment -- so its own INSERT still passes through the friendships INSERT policy (the real
-- defense-in-depth #214/#221/#314 hardened), not bypass it the way a SECURITY DEFINER function
-- (table owners skip RLS by default) would.
select ok(
  (select prosecdef from pg_proc where proname = 'profile_is_discoverable' and pronamespace = 'public'::regnamespace),
  '#234: profile_is_discoverable is SECURITY DEFINER'
);
select ok(has_function_privilege('authenticated', 'public.profile_is_discoverable(uuid)', 'EXECUTE'), '#234: authenticated can execute profile_is_discoverable');
select ok(not has_function_privilege('anon', 'public.profile_is_discoverable(uuid)', 'EXECUTE'), '#234: anon cannot execute profile_is_discoverable');
select ok(
  not (select prosecdef from pg_proc where proname = 'request_friendship' and pronamespace = 'public'::regnamespace),
  '#234: request_friendship stays SECURITY INVOKER -- its own INSERT must still pass through the friendships INSERT policy'
);

-- Direct pin on the helper's own logic, not just observed through the two RPCs that call it -- a
-- constant-return regression (e.g. always true) can't hide behind those.
select is(public.profile_is_discoverable('00000000-0000-0000-0000-000000000003'), false, '#234: profile_is_discoverable(carol) is false -- carol went private above');
select is(public.profile_is_discoverable('00000000-0000-0000-0000-000000000004'), true, '#234: profile_is_discoverable(dave) is true -- dave stays discoverable');

-- =================================================================================================
-- Behavioral: a stranger's raw table select can no longer produce a name->email map.
-- =================================================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';

-- (13)-(14) bob (stranger to alice) hits the exact reproduction from #227's own report.
select throws_like(
  $$select display_name, email, notifications_enabled, created_at, discoverable from public.profiles where user_id = '00000000-0000-0000-0000-000000000001'$$,
  '%permission denied%',
  'GREEN: the #227 reproduction query (explicit email/created_at columns) is now permission-denied'
);
select throws_like(
  $$select * from public.profiles where user_id = '00000000-0000-0000-0000-000000000001'$$,
  '%permission denied%',
  'GREEN: select * is also permission-denied -- it expands to include the now-ungranted columns'
);

-- (15) #234: the residual #227 left open (a stranger's raw select of ANY discoverable row's
-- non-email columns, unbounded) is now CLOSED -- alice is discoverable (default) and bob has no
-- relationship with her, so this returns zero rows, not one.
select is(
  (select count(*)::int from public.profiles where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  '#234 CLOSED: a stranger can no longer read a discoverable row directly at all -- no relationship, no row'
);
reset role;

-- (16)-(17) RED: prove the permission-denied assertions above are actually load-bearing, not
-- failing for an unrelated reason -- temporarily restore the pre-#227-fix blanket grant AND (since
-- #234 also narrowed row visibility) the pre-#234 discoverable=true SELECT arm, together
-- reproducing the exact original bug this file is named for, and watch the #227 reproduction
-- succeed and return alice's real email.
grant select on public.profiles to authenticated;
drop policy "profiles readable by self or existing relationship" on public.profiles;
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
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select is(
  (select email from public.profiles where user_id = '00000000-0000-0000-0000-000000000001'),
  'alice@umass.edu',
  'RED: with the pre-fix blanket SELECT grant AND the pre-#234 discoverable arm restored, bob (a stranger) reads alice''s real email directly'
);
reset role;
-- revert to the fixed grant set and the real (narrowed) SELECT policy -- must run at the ambient
-- (superuser) role, same caution 10's own RED block calls out: a REVOKE/GRANT issued as a
-- non-owner role silently no-ops with a WARNING.
revoke select on public.profiles from authenticated;
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
grant select (user_id, display_name, notifications_enabled, discoverable) on public.profiles to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select throws_like(
  $$select email from public.profiles where user_id = '00000000-0000-0000-0000-000000000001'$$,
  '%permission denied%',
  'GREEN: with the fixed grant restored, the identical select is rejected again'
);
reset role;

-- =================================================================================================
-- search_profiles: min length, discoverable-only, self-exclusion, LIKE-metacharacter escaping, cap.
-- =================================================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';

-- (18)-(19) too-short terms return empty, not an error -- the UI calls this on every keystroke.
select is((select count(*)::int from public.search_profiles('')), 0, 'empty term returns no rows (not an error)');
select is((select count(*)::int from public.search_profiles('a')), 0, '1-char term returns no rows -- cannot match "everyone" via a trivial term');

-- (20) a genuine 2-char term finds a real discoverable match.
select is(
  (select count(*)::int from public.search_profiles('al')),
  1,
  '2-char term matching alice''s name returns exactly her'
);

-- (21) a matching term against a NON-discoverable user (carol) finds nothing.
select is((select count(*)::int from public.search_profiles('carol')), 0, 'a matching term against a private (non-discoverable) user returns nothing');

-- (22) the caller is excluded from their own search results.
select is((select count(*)::int from public.search_profiles('bob')), 0, 'the caller (bob) never appears in their own search results');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000006"}';
-- (23)-(24) LIKE metacharacters in the term are escaped, not interpreted -- an unescaped `_`/`%`
-- would otherwise widen a short, legitimate-looking term back into matching far more than intended.
select is((select count(*)::int from public.search_profiles('a_')), 0, '"a_" does not match "alice" via an unescaped underscore wildcard');
select is((select count(*)::int from public.search_profiles('x%')), 0, '"x%" does not match anyone via an unescaped percent wildcard');
reset role;

-- (25) row cap: 21 discoverable users all matching the same term -- exactly 20 come back.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
select
  ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'capuser' || i::text || '@umass.edu',
  crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()
from generate_series(101, 121) i;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select is(
  (select count(*)::int from public.search_profiles('capuser')),
  20,
  'row cap: 21 matching discoverable users, only 20 returned'
);
reset role;

-- (26) anon cannot call search_profiles at all (behavioral, alongside the ambient check above).
set local role anon;
select throws_like(
  $$select * from public.search_profiles('al')$$,
  '%permission denied%',
  'anon cannot execute search_profiles'
);
reset role;

-- =================================================================================================
-- related_profiles: self + existing relationship (any status) only, silent omission for strangers.
-- =================================================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';

-- (27) self is always included.
select is(
  (select email from public.related_profiles(array['00000000-0000-0000-0000-000000000001']::uuid[]) where user_id = '00000000-0000-0000-0000-000000000001'),
  'alice@umass.edu',
  'related_profiles includes the caller''s own email'
);

-- (28) a pending (not yet accepted) relationship's other party is included -- REQUESTS FOR
-- YOU/SENT need this pre-acceptance, same as the SELECT policy's own relationship arm.
select is(
  (select email from public.related_profiles(array['00000000-0000-0000-0000-000000000004']::uuid[]) where user_id = '00000000-0000-0000-0000-000000000004'),
  'dave@umass.edu',
  'related_profiles includes a pending relationship''s other party (dave)'
);

-- (29) an accepted relationship's other party is included.
select is(
  (select email from public.related_profiles(array['00000000-0000-0000-0000-000000000005']::uuid[]) where user_id = '00000000-0000-0000-0000-000000000005'),
  'erin@umass.edu',
  'related_profiles includes an accepted friend (erin)'
);

-- (30)-(31) frank (no relationship with alice at all) is silently omitted, even mixed into the same
-- call as legitimate ids -- proves this can't be used to probe "does a relationship exist" via a
-- per-id error, and that a stranger can't ride along on a batch lookup.
select is(
  (select count(*)::int from public.related_profiles(array['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006']::uuid[])),
  2,
  'a mixed batch returns only self + the real relationship (dave) -- frank (no relationship) is silently dropped, not errored'
);
select is(
  (select count(*)::int from public.related_profiles(array['00000000-0000-0000-0000-000000000006']::uuid[])),
  0,
  'a batch containing ONLY an unrelated stranger returns zero rows, not an error'
);

-- #234 nit 1: related_profiles is now deterministically ordered by user_id -- a batch of self +
-- dave + erin (ids ...001 < ...004 < ...005) must come back in that exact order, not whatever order
-- the underlying scan happens to produce.
select is(
  (select array_agg(user_id) from (
    select user_id from public.related_profiles(array['00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004']::uuid[])
  ) t),
  array['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005']::uuid[],
  '#234 nit: related_profiles rows come back ordered by user_id regardless of input array order'
);

-- #234 nit 2: related_profiles no longer errors or chokes on an oversized input array -- a cheap
-- defensive slice (first 200 elements -- ponytail: positional, not relevance-ordered, upgrade to a
-- relationship-aware pre-filter if a caller ever needs more than 200 ids in one real batch) caps it
-- before the relationship check runs. The app always puts real ids first (it builds this array from
-- its own known relationship/search-result lists, never attacker-controlled order), so put alice's
-- and dave's ids first here too and pad with 300 garbage ids after -- the call must still succeed
-- and still find both real ids.
select lives_ok(
  $$select count(*) from public.related_profiles(
      array['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004']::uuid[]
      || array(select ('00000000-0000-0000-0000-1' || lpad(i::text, 11, '0'))::uuid from generate_series(1, 300) i)
    )$$,
  '#234 nit: related_profiles does not error on a 302-element input array'
);
select is(
  (select count(*)::int from public.related_profiles(
      array['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004']::uuid[]
      || array(select ('00000000-0000-0000-0000-1' || lpad(i::text, 11, '0'))::uuid from generate_series(1, 300) i)
    )),
  2,
  '#234 nit: with the real ids first in the array, the oversized batch still surfaces alice (self) and dave (real relationship)'
);
reset role;

-- (32) anon cannot call related_profiles at all.
set local role anon;
select throws_like(
  $$select * from public.related_profiles(array['00000000-0000-0000-0000-000000000001']::uuid[])$$,
  '%permission denied%',
  'anon cannot execute related_profiles'
);
reset role;

-- =================================================================================================
-- #234 regression guard: the unbounded directory dump this fix closes, reproduced and re-closed
-- inside this file. Deliberately mutates (unlike everything above) -- restored before this file's
-- own rollback, same convention as 09/10's constraint/policy mutation-red blocks.
-- =================================================================================================

-- grace (id ...201, inserted in this file's top-level user batch) is a genuine stranger to bob,
-- discoverable (default), zero prior relationship -- the worklist entry an attacker's harvest step
-- would pick up.

-- RED: temporarily restore the pre-#234 discoverable=true SELECT arm and prove the exact exploit
-- the issue measured -- bob (a stranger, no relationships at all in this harvest) reads the whole
-- discoverable directory (every seeded user above who never went private, plus grace) in one query.
drop policy "profiles readable by self or existing relationship" on public.profiles;
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

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select cmp_ok(
  (select count(*)::int from public.profiles where discoverable = true),
  '>',
  1,
  'RED: with the discoverable=true SELECT arm restored, bob''s unrelated single query harvests the whole discoverable directory, not just himself'
);
reset role;

-- restore the real, narrowed policy.
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

-- GREEN: the identical query now returns only bob himself (the self arm), regardless of how many
-- other discoverable rows exist -- the unbounded dump is closed.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select is(
  (select count(*)::int from public.profiles where discoverable = true),
  1,
  'GREEN: with the real (narrowed) policy restored, bob''s identical query returns only his own row'
);
reset role;

-- ...and the two legitimate call sites that depend on discoverability -- rerouted through
-- profile_is_discoverable rather than this policy -- are unaffected by the narrowing either way.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$select public.request_friendship('00000000-0000-0000-0000-000000000201')$$,
  '#234: request_friendship still succeeds against grace (a genuine discoverable stranger) with the SELECT arm gone'
);
reset role;
delete from public.friendships where user_a = '00000000-0000-0000-0000-000000000002' and user_b = '00000000-0000-0000-0000-000000000201';

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$insert into public.friendships (user_a, user_b, status, requested_by) values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000201', 'pending', '00000000-0000-0000-0000-000000000002')$$,
  '#234: the raw INSERT path against grace still succeeds too -- the INSERT policy''s helper-backed check does not depend on the dropped SELECT arm'
);
reset role;

-- belt-and-suspenders: the real policy is genuinely restored (guards against the RED/GREEN dance
-- above silently drifting from what's actually shipped).
select doesnt_match(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles readable by self or existing relationship'),
  'discoverable',
  'the SELECT policy is restored to the real, narrowed (no discoverable arm) definition'
);

select * from finish();
rollback;
