-- 20260909200000_edge_cron_shared_secret.sql: the two pg_cron jobs and the pings push trigger must
-- send the `x-udine-cron-secret` header (from Vault's `edge_cron_secret`) alongside the existing
-- publishable-key Authorization header, so the Edge Functions can reject bare anon-key callers.
-- Ambient-state assertions per #222's convention: everything below reads the schema as the
-- migrations left it, nothing is repaired mid-test. Mutation-tested: with the migration's three
-- `'x-udine-cron-secret', (...)` header entries removed, assertions 1-5 go red; with its final
-- revoke removed, 7-8 go red. The trigger's real-insert path stays covered by 07_ping_push_trigger.sql
-- (a null/absent Vault secret in this throwaway DB doesn't make net.http_post raise -- see that
-- file's comment -- so the header addition can't break a ping insert here either; asserted again
-- below anyway so this file is self-contained).
create extension if not exists pgtap;

begin;
select plan(9);

-- 1-2. hourly job
select matches(
  (select command from cron.job where jobname = 'check-favorited-foods-hourly'),
  '''x-udine-cron-secret''',
  'check-favorited-foods-hourly sends the x-udine-cron-secret header'
);
select matches(
  (select command from cron.job where jobname = 'check-favorited-foods-hourly'),
  'name = ''edge_cron_secret''',
  'check-favorited-foods-hourly reads the secret from Vault''s edge_cron_secret entry'
);

-- 3-4. daily job
select matches(
  (select command from cron.job where jobname = 'populate-dishes-daily'),
  '''x-udine-cron-secret''',
  'populate-dishes-daily sends the x-udine-cron-secret header'
);
select matches(
  (select command from cron.job where jobname = 'populate-dishes-daily'),
  'name = ''edge_cron_secret''',
  'populate-dishes-daily reads the secret from Vault''s edge_cron_secret entry'
);

-- 5-6. pings trigger function + Authorization header survives
select matches(
  pg_get_functiondef('public.notify_ping_push()'::regprocedure),
  'x-udine-cron-secret',
  'notify_ping_push sends the x-udine-cron-secret header to send-ping-push'
);

-- The existing Authorization header must survive the rewrite (verify_jwt still needs it).
select ok(
  (select command from cron.job where jobname = 'check-favorited-foods-hourly') like '%check_favorited_foods_auth_token%'
  and (select command from cron.job where jobname = 'populate-dishes-daily') like '%check_favorited_foods_auth_token%'
  and pg_get_functiondef('public.notify_ping_push()'::regprocedure) like '%check_favorited_foods_auth_token%',
  'the publishable-key Authorization header is still sent by both jobs and the trigger'
);

-- 7-8. hygiene: the favorites-cap trigger function matches the other trigger functions' ACL.
select ok(
  not has_function_privilege('anon', 'public.enforce_favorited_foods_cap()', 'execute'),
  'anon cannot execute enforce_favorited_foods_cap'
);
select ok(
  not has_function_privilege('authenticated', 'public.enforce_favorited_foods_cap()', 'execute'),
  'authenticated cannot execute enforce_favorited_foods_cap'
);

-- 9. A real, RLS-gated ping insert still succeeds with the rewritten trigger attached.
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000221', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice-22@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob-22@umass.edu',   crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

insert into public.friendships (user_a, user_b, status, requested_by)
values ('00000000-0000-0000-0000-000000000221', '00000000-0000-0000-0000-000000000222', 'accepted', '00000000-0000-0000-0000-000000000221');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000221"}';
select lives_ok(
  $$insert into public.pings (sender_id, receiver_id, hall_tid, message) values ('00000000-0000-0000-0000-000000000221', '00000000-0000-0000-0000-000000000222', 2, 'Meet me at…')$$,
  'sending a ping still succeeds with the secret-sending trigger attached'
);
reset role;

select * from finish();
rollback;
