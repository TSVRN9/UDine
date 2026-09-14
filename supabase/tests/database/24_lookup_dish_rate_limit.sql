-- Pins lookup-dish's rate-limit/negative-cache/coalescing support tables
-- (20260914140000_lookup_dish_rate_limit.sql) as service_role-only: RLS enabled with zero
-- policies, every grant to anon/authenticated explicitly revoked. Unlike public.dishes (readable
-- by anon/authenticated -- 21_dishes_read_only.sql), none of these four tables are ever meant to
-- be reached through PostgREST by a client at all; lookup-dish itself always talks to them as
-- service_role. Also pins the seeded default hourly_cap and that increment_dish_lookup_count()
-- is unreachable by anon/authenticated (only lookup-dish, as service_role, should ever bump it).
--
-- Mutation-tested: with the migration's `revoke all ... from anon, authenticated` line removed,
-- the "denied" assertions below go red against a live local Postgres (the ambient legacy
-- auto-expose grant for `authenticated` -- see 20260826150000's own doc comment -- would otherwise
-- let a signed-in user read/write these tables); reverted, they're green again. Also caught, while
-- writing this test against the real local stack, that `revoke execute ... from public` alone does
-- NOT block anon/authenticated on a new function here (see the migration's own updated comment on
-- increment_dish_lookup_count()) -- confirmed live, not assumed.
create extension if not exists pgtap;

begin;
select plan(11);

select has_table('public', 'dish_lookup_config', 'dish_lookup_config exists');
select has_table('public', 'dish_lookup_rate_limit', 'dish_lookup_rate_limit exists');
select has_table('public', 'dish_lookup_misses', 'dish_lookup_misses exists');
select has_table('public', 'dish_lookup_inflight', 'dish_lookup_inflight exists');

select is(
  (select hourly_cap from public.dish_lookup_config where id),
  20,
  'dish_lookup_config seeds a default hourly_cap of 20'
);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

set local role anon;
select throws_like(
  $$select * from public.dish_lookup_config$$,
  '%permission denied%',
  'anon cannot select dish_lookup_config -- no client, not even anon, has any legitimate read need here'
);
select throws_like(
  $$select public.increment_dish_lookup_count()$$,
  '%permission denied%',
  'anon cannot call increment_dish_lookup_count() -- only lookup-dish (service_role) may bump the budget'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select throws_like(
  $$select * from public.dish_lookup_misses$$,
  '%permission denied%',
  'authenticated cannot select dish_lookup_misses'
);
select throws_like(
  $$insert into public.dish_lookup_inflight (query_key) values ('bacon')$$,
  '%permission denied%',
  'authenticated cannot insert into dish_lookup_inflight'
);
select throws_like(
  $$select public.increment_dish_lookup_count()$$,
  '%permission denied%',
  'authenticated cannot call increment_dish_lookup_count() either'
);
reset role;

-- service_role bypasses RLS by design (same as every other service-role-only table in this
-- schema -- see 20260826150000's own comment on why service_role is deliberately left untouched)
-- and holds explicit execute -- the atomic increment itself works end to end.
select is(
  (select public.increment_dish_lookup_count()),
  1,
  'increment_dish_lookup_count() atomically creates + returns the first count for a fresh hour bucket'
);

select * from finish();
rollback;
