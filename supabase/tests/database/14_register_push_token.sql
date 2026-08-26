-- #263: push_tokens' PK (user_id, platform, token) let the same shared-device token sit under N
-- users at once. This proves both halves of the fix: the migration's own dedupe-before-constraint
-- safety (ablated below, mirroring 09_discoverable_profiles_and_qr_tokens.sql's constraint-drop
-- pattern), and the steady-state behavior (register_push_token evicts any other owner, a raw insert
-- can't route around it).
create extension if not exists pgtap;

begin;
select plan(16);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@umass.edu',   crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

-- =================================================================================================
-- Ambient (superuser, no mutation yet): the constraint and the EXECUTE grants exist as shipped.
-- =================================================================================================
select ok(
  exists(select 1 from pg_constraint where conname = 'push_tokens_platform_token_key' and contype = 'u'),
  'push_tokens_platform_token_key is a real unique constraint'
);
select ok(has_function_privilege('authenticated', 'public.register_push_token(text, text)', 'EXECUTE'), 'authenticated can execute register_push_token');
select ok(not has_function_privilege('anon', 'public.register_push_token(text, text)', 'EXECUTE'), 'anon cannot execute register_push_token');
select ok(not has_function_privilege('public', 'public.register_push_token(text, text)', 'EXECUTE'), 'public cannot execute register_push_token');

-- =================================================================================================
-- Migration-safety ablation: prove the dedupe-before-constraint logic itself, not just the end
-- state. The constraint already exists by the time this test runs (migrations apply before pgTAP),
-- so duplicates can't be inserted with it in place -- drop it, seed a real duplicate pair the way an
-- old (pre-#263) client's raw upsert could have left one, run the migration's own DELETE verbatim,
-- and confirm exactly the newer row survives before restoring the constraint to its shipped state.
-- =================================================================================================
alter table public.push_tokens drop constraint push_tokens_platform_token_key;

insert into public.push_tokens (user_id, platform, token, created_at) values
  ('00000000-0000-0000-0000-000000000001', 'expo', 'DUPLICATE-TOKEN', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000002', 'expo', 'DUPLICATE-TOKEN', now());

select is(
  (select count(*)::int from public.push_tokens where platform = 'expo' and token = 'DUPLICATE-TOKEN'),
  2,
  'RED fixture: two different users hold the same (platform, token) row, exactly what an old raw-upsert client could leave behind'
);

-- Verbatim copy of 20260825140000_register_push_token.sql's own dedupe statement.
delete from public.push_tokens t
using public.push_tokens newer
where t.platform = newer.platform
  and t.token = newer.token
  and (
    newer.created_at > t.created_at
    or (newer.created_at = t.created_at and newer.ctid > t.ctid)
  );

select is(
  (select count(*)::int from public.push_tokens where platform = 'expo' and token = 'DUPLICATE-TOKEN'),
  1,
  'the migration''s dedupe leaves exactly one row per (platform, token)'
);
select is(
  (select user_id from public.push_tokens where platform = 'expo' and token = 'DUPLICATE-TOKEN'),
  '00000000-0000-0000-0000-000000000002'::uuid,
  'the surviving row is the more recently created one (bob), not an arbitrary/oldest one'
);

-- Clean up the fixture before re-adding the constraint (mirrors 09's own "revert before re-adding"
-- caution -- ADD CONSTRAINT validates every existing row immediately).
delete from public.push_tokens where platform = 'expo' and token = 'DUPLICATE-TOKEN';
alter table public.push_tokens add constraint push_tokens_platform_token_key unique (platform, token);

-- =================================================================================================
-- Steady-state behavior, RLS-gated (as each user, not the ambient superuser role).
-- =================================================================================================

-- Alice registers a shared token.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select public.register_push_token('expo', 'SHARED-TOKEN');
reset role;

select is(
  (select user_id from public.push_tokens where platform = 'expo' and token = 'SHARED-TOKEN'),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'alice registering a fresh token: she owns the row'
);

-- Bob registers the SAME token (the shared-device scenario #263 is about): alice's row must be
-- evicted, bob's insert must succeed -- not 23505.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$select public.register_push_token('expo', 'SHARED-TOKEN')$$,
  'bob registering alice''s token does not raise a unique violation'
);
reset role;

select is(
  (select count(*)::int from public.push_tokens where platform = 'expo' and token = 'SHARED-TOKEN'),
  1,
  'still exactly one row for the shared token -- no duplicate left behind'
);
select is(
  (select user_id from public.push_tokens where platform = 'expo' and token = 'SHARED-TOKEN'),
  '00000000-0000-0000-0000-000000000002'::uuid,
  'bob registering the token evicted alice -- he is now the sole owner'
);

-- Alice registers again: the eviction runs the other direction too.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select public.register_push_token('expo', 'SHARED-TOKEN');
reset role;

select is(
  (select user_id from public.push_tokens where platform = 'expo' and token = 'SHARED-TOKEN'),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'alice registering again evicts bob right back -- eviction is not one-directional'
);

-- A raw insert (not through the RPC) cannot route around the constraint: bob trying to claim
-- alice's current token by inserting his own row directly hits the unique violation the RPC exists
-- to avoid.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select throws_like(
  $$insert into public.push_tokens (user_id, platform, token) values ('00000000-0000-0000-0000-000000000002', 'expo', 'SHARED-TOKEN')$$,
  '%push_tokens_platform_token_key%',
  'a raw insert cannot evict another owner -- it hits the unique constraint instead'
);
reset role;

-- register_push_token is still owner-scoped by auth.uid(), not a free-standing takeover primitive --
-- confirm alice's row is untouched by bob's failed raw-insert attempt above.
select is(
  (select user_id from public.push_tokens where platform = 'expo' and token = 'SHARED-TOKEN'),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'alice''s row survives bob''s failed raw-insert attempt'
);

-- Null auth.uid() guard: authenticated role with no `sub` claim at all.
set local role authenticated;
set local request.jwt.claims = '{}';
select throws_like(
  $$select public.register_push_token('expo', 'no-session-token')$$,
  '%must be signed in%',
  'register_push_token rejects a caller with no auth.uid()'
);
reset role;

select is(
  (select count(*)::int from public.push_tokens where token = 'no-session-token'),
  0,
  'the null-auth.uid() attempt above did not write a row'
);

select * from finish();
rollback;
