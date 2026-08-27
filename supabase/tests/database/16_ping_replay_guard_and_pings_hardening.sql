-- Issues #196 + #228 (folded, see the migration's own header comment for why). Covers:
--   (a) #196's pushed_at replay guard -- both that a client can never reset the claim (ambient grant/
--       policy checks, per #222's convention of reading catalog state rather than only the test's
--       own repair cycle) and that the atomic claim itself behaves as "at most once" (the same
--       `update ... where pushed_at is null returning` pattern send-ping-push/index.ts uses, proven
--       directly in SQL rather than by invoking the Edge Function from pgTAP, which can't reach it).
--   (b) #228 item 1's pings.message/hall_tid CHECK constraints.
--   (c) #228 item 2's food_sightings retention cron job -- ambient existence + that its scheduled
--       command actually targets food_sightings with the intended retention window (07_ping_push_
--       trigger.sql already documents why a local, networkless pgTAP run can't make a job fire; this
--       file has the same limitation and doesn't attempt to prove the sweep actually runs).
--   (d) #228 item 3's verify_jwt config pin is a supabase/config.toml change with no SQL surface --
--       not exercised here, see the PR body for its own (necessarily manual) verification.
create extension if not exists pgtap;

begin;
select plan(17);

-- =================================================================================================
-- Ambient state: read what actually shipped, before any of this file's own inserts/updates run.
-- =================================================================================================

select has_column('public', 'pings', 'pushed_at', 'pings.pushed_at column exists');

-- A client must never be able to reset the replay guard back to null and re-arm its own ping --
-- proven two ways: no UPDATE table-privilege at all for authenticated, and (belt and suspenders) no
-- RLS policy would even admit one if the grant were ever restored.
select ok(
  not has_table_privilege('authenticated', 'public.pings', 'UPDATE'),
  'authenticated has no UPDATE privilege on public.pings'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'pings' and cmd = 'UPDATE'),
  0,
  'no RLS UPDATE policy exists on public.pings either'
);
-- The Edge Function's own client (service_role) must still be able to make the claim.
select ok(
  has_table_privilege('service_role', 'public.pings', 'UPDATE'),
  'service_role can still UPDATE public.pings (needed for the atomic pushed_at claim)'
);

select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.pings'::regclass and conname = 'pings_message_length'),
  'pings_message_length check constraint exists'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.pings'::regclass and conname = 'pings_hall_tid_valid'),
  'pings_hall_tid_valid check constraint exists'
);

select ok(
  exists (select 1 from cron.job where jobname = 'food-sightings-retention-daily'),
  'food-sightings-retention-daily cron job is scheduled'
);
select matches(
  (select command from cron.job where jobname = 'food-sightings-retention-daily'),
  'delete from public\.food_sightings',
  'the retention job actually deletes from food_sightings'
);
select matches(
  (select command from cron.job where jobname = 'food-sightings-retention-daily'),
  '30 days',
  'the retention job uses a 30-day window'
);

-- =================================================================================================
-- Behavioral: constraints (RLS-gated, as a real friend-to-friend ping insert).
-- =================================================================================================

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@umass.edu',   crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

insert into public.friendships (user_a, user_b, status, requested_by)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'accepted', '00000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';

select lives_ok(
  $$insert into public.pings (sender_id, receiver_id, hall_tid, message) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 2, 'a normal message')$$,
  'a normal ping still inserts fine with the new constraints'
);

select throws_like(
  $$insert into public.pings (sender_id, receiver_id, hall_tid, message) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 1, repeat('x', 281))$$,
  '%pings_message_length%',
  'a 281-char message is rejected'
);
select lives_ok(
  $$insert into public.pings (sender_id, receiver_id, hall_tid, message) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 1, repeat('x', 280))$$,
  'a 280-char message (the cap itself) is accepted'
);

select throws_like(
  $$insert into public.pings (sender_id, receiver_id, hall_tid, message) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 999, 'hi')$$,
  '%pings_hall_tid_valid%',
  'hall_tid 999 (not a real dining hall) is rejected'
);
select lives_ok(
  $$insert into public.pings (sender_id, receiver_id, hall_tid, message) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', null, 'no hall yet')$$,
  'a null hall_tid (no hall picked yet) is still accepted'
);

-- A signed-in sender still can't reset their own ping's pushed_at -- permission-denied at the
-- table-grant level, before RLS even runs (matches the ambient assertion above).
select throws_like(
  $$update public.pings set pushed_at = null where sender_id = '00000000-0000-0000-0000-000000000001'$$,
  '%permission denied%',
  'authenticated cannot write pings.pushed_at at all'
);
reset role;

-- =================================================================================================
-- Behavioral: the atomic claim itself -- "at most once", the actual fix for #196. This is the same
-- `update ... where pushed_at is null returning ...` send-ping-push/index.ts now runs, as the same
-- role (service_role) it authenticates as.
-- =================================================================================================

set local role service_role;

-- A top-level `update ... returning` inside a WITH is fine (CREATE TABLE AS's own query is the top
-- level); nesting that same WITH one level deeper -- inside pgtap's `is(sql, ...)` subquery form, or
-- discarding it via a plpgsql PERFORM (which also swallows ok()'s TAP output, so pgtap never sees
-- the assertion at all) -- both failed when this was first written. A scratch temp table is the
-- plainest way to capture the real row count from a top-level, atomic UPDATE.
create temporary table claim_attempt_1 as
with claimed as (
  update public.pings set pushed_at = now()
  where sender_id = '00000000-0000-0000-0000-000000000001'
    and receiver_id = '00000000-0000-0000-0000-000000000002'
    and hall_tid = 2
    and pushed_at is null
  returning id
)
select count(*)::int as n from claimed;

select is((select n from claim_attempt_1), 1, 'the first claim on a fresh ping succeeds and updates exactly one row');
drop table claim_attempt_1;

create temporary table claim_attempt_2 as
with claimed as (
  update public.pings set pushed_at = now()
  where sender_id = '00000000-0000-0000-0000-000000000001'
    and receiver_id = '00000000-0000-0000-0000-000000000002'
    and hall_tid = 2
    and pushed_at is null
  returning id
)
select count(*)::int as n from claimed;

select is((select n from claim_attempt_2), 0, 'replaying the same claim (pushed_at already set) updates zero rows -- this is the #196 fix');
drop table claim_attempt_2;

reset role;

select * from finish();
rollback;
