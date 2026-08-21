-- Issue #95: public.pings gets an AFTER INSERT trigger (notify_ping_push -> net.http_post to
-- send-ping-push) so a new ping pushes to its receiver immediately. This only checks the trigger is
-- actually attached and that it never breaks a real ping insert (the exception guard inside
-- notify_ping_push exists exactly so a vault/pg_net hiccup can't fail this) -- it does NOT assert on
-- pg_net's internal queue table, which is version-fragile and not this test's job; that a live call
-- actually reaches send-ping-push is verified separately (see the PR description for the live
-- invocation evidence), not something a local, networkless pgTAP run can observe.
create extension if not exists pgtap;

begin;
select plan(2);

select has_trigger('public', 'pings', 'ping_push_notify', 'the ping-push trigger is attached to public.pings');

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@umass.edu',   crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

insert into public.friendships (user_a, user_b, status, requested_by)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'accepted', '00000000-0000-0000-0000-000000000001');

-- With no 'check_favorited_foods_auth_token' vault secret seeded in this local, throwaway database
-- (it's only ever seeded on the live project, per the schedule-cron migration's own comment), the
-- trigger's net.http_post call runs with a null Authorization header -- exactly the "something about
-- the dispatch path is off" case the exception guard exists for. The insert must still succeed.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$insert into public.pings (sender_id, receiver_id, hall_tid, message) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 4, 'Let''s go to…')$$,
  'sending a ping still succeeds with the push trigger attached'
);
reset role;

select * from finish();
rollback;
