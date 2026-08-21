-- #94: shared_stats privacy -- opt-in per stat, default all-off, accepted-friends-only read,
-- revoke deletes the field. Proves: (1) no row at all exposes nothing to a friend, (2) an owner can
-- write their own row, (3) a field left null (never opted in) stays absent even to an accepted
-- friend reading the row, (4) an opted-in field IS visible to an accepted friend, (5) a stranger and
-- a pending (not-yet-accepted) connection see nothing, (6) a friend can read but never write
-- (update/delete) the owner's row, (7) revoking (setting a field back to null) actually removes it
-- for a friend who could previously see it, not just stops future updates, (8) an anon session sees
-- nothing either.
create extension if not exists pgtap;

begin;
select plan(19);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@umass.edu',   crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carol@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dave@umass.edu',  crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

-- alice & bob are accepted friends; carol is a stranger to alice; alice & dave are still pending
-- (request_friendship's realistic mid-state, same fixture pings' RLS test uses).
insert into public.friendships (user_a, user_b, status, requested_by)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'accepted', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'pending', '00000000-0000-0000-0000-000000000001');

-- (1) Default-off exposes nothing: alice has no shared_stats row at all yet. Her accepted friend
-- bob's select for her row returns zero rows -- not an error, not a row full of nulls, nothing.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select is(
  (select count(*)::int from public.shared_stats where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'no shared_stats row at all: an accepted friend sees nothing (default-off exposes nothing)'
);
reset role;

-- (2) Owner writes: alice opts into hall completion only (top_foods, hall_ranks stay unset/null).
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$insert into public.shared_stats (user_id, completion) values ('00000000-0000-0000-0000-000000000001', '[{"hallTid":1,"loggedDistinct":3,"seenDistinct":10}]'::jsonb)$$,
  'alice can insert her own shared_stats row with only completion opted in'
);
select is(
  (select top_foods from public.shared_stats where user_id = '00000000-0000-0000-0000-000000000001'),
  null,
  'top_foods stays null -- never opted in, never written'
);
reset role;

-- Alice cannot write a row for someone else (owner-only insert, same shape as every other
-- own-row table in this schema).
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select throws_like(
  $$insert into public.shared_stats (user_id, completion) values ('00000000-0000-0000-0000-000000000002', '[]'::jsonb)$$,
  '%row-level security policy%',
  'alice cannot insert a shared_stats row for bob'
);
reset role;

-- (3) & (4) An accepted friend sees an opted-in field, and an un-opted field stays absent to them
-- too -- privacy by presence holds through the friend-read path, not just the owner's own read.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select is(
  (select count(*)::int from public.shared_stats where user_id = '00000000-0000-0000-0000-000000000001'),
  1,
  'bob (accepted friend) can now read alice''s row'
);
select is(
  (select completion from public.shared_stats where user_id = '00000000-0000-0000-0000-000000000001'),
  '[{"hallTid":1,"loggedDistinct":3,"seenDistinct":10}]'::jsonb,
  'bob sees the opted-in completion stat, unmodified'
);
select is(
  (select top_foods from public.shared_stats where user_id = '00000000-0000-0000-0000-000000000001'),
  null,
  'bob sees top_foods as absent -- alice never opted in, even though he can read the row'
);
reset role;

-- (5) A stranger (carol) and a pending-only connection (dave) see nothing -- same mechanism as
-- pings' friendship check, ported to select instead of insert.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003"}';
select is(
  (select count(*)::int from public.shared_stats where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'carol (no friendship with alice at all) sees nothing'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000004"}';
select is(
  (select count(*)::int from public.shared_stats where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'dave (pending, not yet accepted) sees nothing'
);
reset role;

-- Anon (no session at all) is rejected outright -- there is no `anon` grant on this table at all
-- (matching every other table in this schema: friendships/pings/favorited_foods/etc. are all
-- `authenticated`-only at the grant level, so anon never even reaches RLS to be filtered down to
-- zero rows -- it's a hard permission-denied, a stronger guarantee than an empty result).
set local role anon;
select throws_like(
  $$select count(*) from public.shared_stats where user_id = '00000000-0000-0000-0000-000000000001'$$,
  '%permission denied%',
  'an anonymous session is rejected outright -- no anon grant on this table, same as every other social table'
);
reset role;

-- (6) A friend can read but never write: bob cannot update or delete alice's row, even though he
-- can select it. This is the shape most likely to regress if the owner "for all" policy's USING
-- clause is ever loosened to admit friends. An UPDATE/DELETE whose target row fails a policy's
-- USING clause doesn't throw (that's an INSERT/WITH-CHECK thing) -- it silently matches zero rows,
-- same precedent as 05_own_row_tables_rls.sql's "alice cannot update bob's row" case. Proving the
-- denial means running the statement (lives_ok -- it's a no-op, not an error) and then checking the
-- row is actually unchanged, not asserting an exception that RLS was never going to raise here.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$update public.shared_stats set completion = '[]'::jsonb where user_id = '00000000-0000-0000-0000-000000000001'$$,
  'bob''s update attempt on alice''s row runs without error (and, per the next assertion, touches nothing)'
);
select lives_ok(
  $$delete from public.shared_stats where user_id = '00000000-0000-0000-0000-000000000001'$$,
  'bob''s delete attempt on alice''s row runs without error (and, per the next assertion, deletes nothing)'
);
reset role;

select is(
  (select completion from public.shared_stats where user_id = '00000000-0000-0000-0000-000000000001'),
  '[{"hallTid":1,"loggedDistinct":3,"seenDistinct":10}]'::jsonb,
  'bob''s update was silently filtered out by RLS -- alice''s completion is unchanged'
);
select is(
  (select count(*)::int from public.shared_stats where user_id = '00000000-0000-0000-0000-000000000001'),
  1,
  'bob''s delete was silently filtered out by RLS -- alice''s row still exists'
);

-- A JSON *null* literal is a distinct, non-NULL value from SQL NULL -- the check constraints reject
-- it outright rather than letting "privacy by presence" quietly break the moment some future caller
-- writes `{ field: null }` as a JS value.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select throws_like(
  $$update public.shared_stats set completion = 'null'::jsonb where user_id = '00000000-0000-0000-0000-000000000001'$$,
  '%shared_stats_completion_not_json_null%',
  'a JSON null literal (as opposed to SQL NULL) is rejected by the check constraint'
);
reset role;

-- (7) Revoke deletes the field: alice turns hall completion back off. The field disappears for
-- her own read AND for bob's, immediately -- not "stops updating", actually gone.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$update public.shared_stats set completion = null where user_id = '00000000-0000-0000-0000-000000000001'$$,
  'alice can revoke (null out) her own completion field'
);
select is(
  (select completion from public.shared_stats where user_id = '00000000-0000-0000-0000-000000000001'),
  null,
  'completion is gone from alice''s own read after revoke'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select is(
  (select completion from public.shared_stats where user_id = '00000000-0000-0000-0000-000000000001'),
  null,
  'completion is gone from bob''s read too -- revoke deletes the field, not just stops updating it'
);
reset role;

-- Owner can also delete the whole row outright (both readings of "revoke" -- per-field per #94's
-- own spec, and whole-row as a coarser fallback -- are covered).
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$delete from public.shared_stats where user_id = '00000000-0000-0000-0000-000000000001'$$,
  'alice can delete her own shared_stats row outright'
);
reset role;

select * from finish();
rollback;
