-- Issue #95: public.pings gets an AFTER INSERT trigger (notify_ping_push -> net.http_post to
-- send-ping-push) so a new ping pushes to its receiver immediately. This checks two things only:
-- the trigger is actually attached, and a real, RLS-gated ping insert still succeeds with it
-- attached. It does NOT assert on pg_net's internal queue table (version-fragile, not this test's
-- job) and it does NOT exercise notify_ping_push's `exception when others` block -- see the comment
-- at the insert below for why that guard is untested under this harness. That a live call actually
-- reaches send-ping-push is verified separately (see the PR description for the live invocation
-- evidence), not something a local, networkless pgTAP run can observe.
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
-- trigger's net.http_post call runs with a null Authorization header. This does NOT exercise
-- notify_ping_push's `exception when others` block, despite an earlier version of this comment
-- claiming it did -- net.http_post is fire-and-forget: it enqueues the request and returns
-- immediately without raising, even with a null/bad Authorization header (the resulting 401 happens
-- later, asynchronously, outside this transaction, invisible to the trigger's own exception
-- handling). Verified directly: with the `exception when others` block removed entirely from
-- notify_ping_push, this same test still passes -- there's nothing for the guard to catch under
-- normal operation, only under a failure mode this local harness can't induce (`postgres` isn't
-- superuser over the `net` schema here, so a pgTAP file can't make net.http_post itself raise). The
-- guard is real defensive coverage against, e.g., a future refactor that adds fallible logic before
-- the net.http_post call -- it's just not something this test (or any test on this stack) currently
-- exercises. What this insert DOES prove: a real, RLS-gated ping insert succeeds with the trigger
-- attached, regardless of what the trigger's downstream dispatch does.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$insert into public.pings (sender_id, receiver_id, hall_tid, message) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 4, 'Let''s go to…')$$,
  'sending a ping still succeeds with the push trigger attached'
);
reset role;

select * from finish();
rollback;
