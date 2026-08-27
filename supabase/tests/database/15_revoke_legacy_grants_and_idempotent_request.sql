-- #201/#221: the legacy Supabase auto-expose default ACL granted anon/authenticated/service_role
-- ALL privileges on every public table, independent of anything this repo's own migrations ever
-- granted. RLS still gated SELECT/INSERT/UPDATE/DELETE, but TRUNCATE is never RLS-gated at all --
-- reproduced pre-fix (see PR body / 20260826150000's own comment) with `set local role
-- authenticated; truncate table public.pings;` succeeding outright. This file asserts the fix:
-- TRUNCATE refused on the four tables #221 names, plus the unrelated one-line idempotent-re-request
-- policy fix in the same migration. #314 (see 20260826160000) later found and fixed a
-- correlated-subquery bug in that same idempotent-re-request policy arm -- the second block below,
-- past the original #221 assertions, covers that regression.
create extension if not exists pgtap;

begin;
select plan(8);

-- ---------------------------------------------------------------------------------------------
-- #221: TRUNCATE reachable by any authenticated user -- now refused on all four named tables.
-- ---------------------------------------------------------------------------------------------

set local role authenticated;
select throws_like(
  $$truncate public.friendships$$,
  '%permission denied%',
  'authenticated cannot truncate friendships'
);
reset role;

set local role authenticated;
select throws_like(
  $$truncate public.pings$$,
  '%permission denied%',
  'authenticated cannot truncate pings'
);
reset role;

set local role authenticated;
select throws_like(
  $$truncate public.profiles$$,
  '%permission denied%',
  'authenticated cannot truncate profiles'
);
reset role;

set local role authenticated;
select throws_like(
  $$truncate public.shared_stats$$,
  '%permission denied%',
  'authenticated cannot truncate shared_stats'
);
reset role;

-- ---------------------------------------------------------------------------------------------
-- #221: idempotent re-request must no-op, not raise, once the other participant has turned
-- discoverability off after a friendships row already exists for the pair.
-- ---------------------------------------------------------------------------------------------

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'erin@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'frank@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

-- erin requests frank while frank is still discoverable (default true).
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1"}';
select public.request_friendship('00000000-0000-0000-0000-0000000000e2');
reset role;

-- frank later turns discoverability off, e.g. after already seeing the pending request.
update public.profiles set discoverable = false where user_id = '00000000-0000-0000-0000-0000000000e2';

-- erin's client re-fires request_friendship (stale UI state) against the now-non-discoverable
-- frank -- a friendships row already exists for the pair, so this must silently no-op, not raise
-- "new row violates row-level security policy".
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1"}';
select lives_ok(
  $$select public.request_friendship('00000000-0000-0000-0000-0000000000e2')$$,
  'idempotent re-request no-ops instead of raising once the target has turned discoverability off'
);
reset role;

select is(
  (select count(*)::int from public.friendships
     where user_a = '00000000-0000-0000-0000-0000000000e1' and user_b = '00000000-0000-0000-0000-0000000000e2'),
  1,
  'still exactly one friendships row for the pair -- no duplicate, no error'
);

-- ---------------------------------------------------------------------------------------------
-- #314: the idempotent-exemption OR-arm above ("a friendships row already exists for this pair")
-- was written as a correlated subquery whose bare `user_a`/`user_b` references collided with the
-- subquery's own alias `f` (same-named columns), resolving to `f.user_a = f.user_a and
-- f.user_b = f.user_b` -- a tautology, true for ANY friendships row visible to the caller, not
-- just the pair being inserted. The test above never caught this because it only ever has ONE
-- friendships row in scope (the erin/frank pair itself), so "any row exists" and "this pair's row
-- exists" happened to coincide. This block adds a SECOND, unrelated pair -- one the attacker (gina)
-- can actually see under RLS (her own accepted friendship with ike) -- and proves the exemption
-- fires only for the pair actually being inserted, not "any row exists anywhere".
-- ---------------------------------------------------------------------------------------------

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gina@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ike@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'henry@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

-- gina's own unrelated accepted friendship with ike -- visible to gina under RLS, and (pre-fix)
-- enough to satisfy the tautology for ANY insert gina attempts, not just this pair.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1"}';
select public.request_friendship('00000000-0000-0000-0000-0000000000b2');
reset role;
update public.friendships
  set status = 'accepted'
  where user_a = least('00000000-0000-0000-0000-0000000000b1'::uuid, '00000000-0000-0000-0000-0000000000b2'::uuid)
    and user_b = greatest('00000000-0000-0000-0000-0000000000b1'::uuid, '00000000-0000-0000-0000-0000000000b2'::uuid);

-- henry: non-discoverable, zero prior relationship with gina whatsoever.
update public.profiles set discoverable = false where user_id = '00000000-0000-0000-0000-0000000000b3';

-- gina raw-inserts (bypassing request_friendship) a pending request targeting henry. This is the
-- issue's confirmed exploit: must be REJECTED. Pre-fix, the tautology lets it through.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1"}';
select throws_like(
  $$insert into public.friendships (user_a, user_b, status, requested_by, origin)
    values (
      least('00000000-0000-0000-0000-0000000000b1'::uuid, '00000000-0000-0000-0000-0000000000b3'::uuid),
      greatest('00000000-0000-0000-0000-0000000000b1'::uuid, '00000000-0000-0000-0000-0000000000b3'::uuid),
      'pending', '00000000-0000-0000-0000-0000000000b1', 'search'
    )$$,
  '%row-level security%',
  'unrelated pre-existing friendship does not exempt a request to a non-discoverable stranger'
);
reset role;

select is(
  (select count(*)::int from public.friendships
     where user_a = least('00000000-0000-0000-0000-0000000000b1'::uuid, '00000000-0000-0000-0000-0000000000b3'::uuid)
       and user_b = greatest('00000000-0000-0000-0000-0000000000b1'::uuid, '00000000-0000-0000-0000-0000000000b3'::uuid)),
  0,
  'no friendships row was created for the exploited (gina, henry) pair'
);

select * from finish();
rollback;
