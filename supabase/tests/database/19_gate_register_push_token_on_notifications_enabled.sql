-- #277: register_push_token no-ops (returns null, writes nothing) when the CALLER's
-- profiles.notifications_enabled is false -- the server-side backstop for the three client-side
-- push-token-resurrection race windows #275's review left open (favoriteFoodAlerts.ts's
-- reregisterPushToken reads `enabled` once, before its own network round trip, and never re-reads
-- it before calling this RPC). Ambient per #222: every assertion below reads real table state
-- after the RPC call, not a value the test itself just wrote to make the assertion trivially true.
create extension if not exists pgtap;

begin;
select plan(9);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice-19@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob-19@umass.edu',   crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

-- handle_new_user() creates a profile row for each with the column default (true as of
-- 20260826140000). Explicitly pin both so this test doesn't depend on that default surviving a
-- future change -- alice is the disabled caller throughout, bob is the enabled control.
update public.profiles set notifications_enabled = false where user_id = '00000000-0000-0000-0000-000000000011';
update public.profiles set notifications_enabled = true  where user_id = '00000000-0000-0000-0000-000000000012';

-- =================================================================================================
-- Fresh registration, caller disabled: no row written, RPC returns null.
-- =================================================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000011"}';
select is(
  (select public.register_push_token('expo', 'DISABLED-FRESH-TOKEN')),
  null::public.push_tokens,
  'a disabled caller registering a brand-new token gets a null return, not a written row'
);
reset role;

select is(
  (select count(*)::int from public.push_tokens where platform = 'expo' and token = 'DISABLED-FRESH-TOKEN'),
  0,
  'no push_tokens row exists for the disabled caller''s fresh-token attempt'
);

-- =================================================================================================
-- Steady state unaffected: caller enabled still registers/evicts exactly as before #277.
-- =================================================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000012"}';
select public.register_push_token('expo', 'ENABLED-TOKEN');
reset role;

select is(
  (select user_id from public.push_tokens where platform = 'expo' and token = 'ENABLED-TOKEN'),
  '00000000-0000-0000-0000-000000000012'::uuid,
  'an enabled caller registering a fresh token still owns the row (steady state unchanged)'
);

-- =================================================================================================
-- Evict-and-reassign, EVICTING caller disabled: bob (enabled) already owns a token; alice
-- (disabled) tries to steal it via the same insert-on-conflict path. Must no-op -- bob's row must
-- be completely untouched, not just "still exists".
-- =================================================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000011"}';
select is(
  (select public.register_push_token('expo', 'ENABLED-TOKEN')),
  null::public.push_tokens,
  'a disabled caller cannot evict-and-reassign an enabled owner''s token -- null return'
);
reset role;

select is(
  (select count(*)::int from public.push_tokens where platform = 'expo' and token = 'ENABLED-TOKEN'),
  1,
  'still exactly one row for the token bob owns -- the disabled steal attempt wrote nothing'
);
select is(
  (select user_id from public.push_tokens where platform = 'expo' and token = 'ENABLED-TOKEN'),
  '00000000-0000-0000-0000-000000000012'::uuid,
  'bob remains the sole owner -- untouched by alice''s disabled steal attempt'
);

-- =================================================================================================
-- Once alice is enabled, the exact same call she made above now succeeds -- proves the earlier
-- no-op was the notifications_enabled gate specifically, not some other rejection.
-- =================================================================================================
update public.profiles set notifications_enabled = true where user_id = '00000000-0000-0000-0000-000000000011';

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000011"}';
select lives_ok(
  $$select public.register_push_token('expo', 'ENABLED-TOKEN')$$,
  'the same eviction alice''s disabled call above no-op''d now succeeds once she is enabled'
);
reset role;

select is(
  (select user_id from public.push_tokens where platform = 'expo' and token = 'ENABLED-TOKEN'),
  '00000000-0000-0000-0000-000000000011'::uuid,
  'alice now owns the token -- flipping notifications_enabled is what changed, nothing else'
);

-- =================================================================================================
-- A caller with no profiles row at all (shouldn't happen given handle_new_user, but the RPC reads
-- via a plain SELECT with no row found guaranteed by any FK) is treated the same as disabled, not
-- as an error and not as an implicit allow.
-- =================================================================================================
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carol-19@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());
delete from public.profiles where user_id = '00000000-0000-0000-0000-000000000013';

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000013"}';
select is(
  (select public.register_push_token('expo', 'NO-PROFILE-TOKEN')),
  null::public.push_tokens,
  'a caller with no profiles row at all is treated as not-enabled, not as an error or implicit allow'
);
reset role;

select * from finish();
rollback;
