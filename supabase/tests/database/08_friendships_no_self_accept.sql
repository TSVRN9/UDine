-- PR #126 review (BLOCK): the pre-existing "participants can update their friendships" policy
-- (20260817220000_friends_pings_favorited_foods.sql) has no guard against the REQUESTER accepting
-- their own pending request -- reviewer demonstrated this against the local stack. shared_stats'
-- friend-read policy (20260820120000_shared_stats.sql) trusts status = 'accepted', so an unguarded
-- self-accept turns into a stats-read hole: mallory sends bob an unsolicited request, accepts it
-- herself, and reads whatever bob opted into. Fixed in
-- 20260821090000_fix_friendships_self_accept.sql. This file is red against that pre-fix policy and
-- green after it.
create extension if not exists pgtap;

begin;
select plan(8);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mallory@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@umass.edu',     crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

-- bob opted into hall completion -- this is exactly what mallory is after.
insert into public.shared_stats (user_id, completion) values
  ('00000000-0000-0000-0000-0000000000b1', '[{"hallTid":1,"loggedDistinct":7,"seenDistinct":10}]'::jsonb);

-- mallory sends bob an unsolicited request. Canonical order: a1 < b1.
insert into public.friendships (user_a, user_b, status, requested_by)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'pending', '00000000-0000-0000-0000-0000000000a1');

-- Attempt 1: mallory (the requester) tries a plain self-accept.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
select lives_ok(
  $$update public.friendships set status = 'accepted' where user_a = '00000000-0000-0000-0000-0000000000a1' and user_b = '00000000-0000-0000-0000-0000000000b1'$$,
  'mallory''s plain self-accept runs without error (RLS silently filters it, doesn''t throw)'
);
reset role;

select is(
  (select status from public.friendships where user_a = '00000000-0000-0000-0000-0000000000a1' and user_b = '00000000-0000-0000-0000-0000000000b1'),
  'pending',
  'still pending after the plain self-accept -- mallory did not actually change anything'
);

-- Attempt 2: the two-field forge -- rewrites requested_by to bob in the SAME statement, defeating
-- any guard that lives in WITH CHECK (which only sees the new row). Only a USING-clause guard (which
-- sees the OLD row, before the forge) can catch this.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
select lives_ok(
  $$update public.friendships set status = 'accepted', requested_by = '00000000-0000-0000-0000-0000000000b1' where user_a = '00000000-0000-0000-0000-0000000000a1' and user_b = '00000000-0000-0000-0000-0000000000b1'$$,
  'mallory''s two-field forge (status + requested_by in one statement) runs without error'
);
reset role;

select is(
  (select status from public.friendships where user_a = '00000000-0000-0000-0000-0000000000a1' and user_b = '00000000-0000-0000-0000-0000000000b1'),
  'pending',
  'still pending after the two-field forge -- a WITH-CHECK-only guard would have missed this'
);

-- After both attempts, mallory still cannot read bob's shared_stats -- the actual impact the
-- friendships hole was about to cause.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
select is(
  (select count(*)::int from public.shared_stats where user_id = '00000000-0000-0000-0000-0000000000b1'),
  0,
  'after both self-accept attempts, mallory still reads zero shared_stats rows for bob'
);
reset role;

-- The legitimate path still works: bob (the addressee, not the requester) accepts for real.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1"}';
select lives_ok(
  $$update public.friendships set status = 'accepted' where user_a = '00000000-0000-0000-0000-0000000000a1' and user_b = '00000000-0000-0000-0000-0000000000b1'$$,
  'bob (the addressee) can accept the request himself'
);
reset role;

select is(
  (select status from public.friendships where user_a = '00000000-0000-0000-0000-0000000000a1' and user_b = '00000000-0000-0000-0000-0000000000b1'),
  'accepted',
  'accepted for real once bob (not mallory) does it'
);

-- Now that they're genuinely friends, mallory CAN read bob's opted-in stat -- confirms the fix
-- doesn't over-tighten the legitimate flow.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
select is(
  (select count(*)::int from public.shared_stats where user_id = '00000000-0000-0000-0000-0000000000b1'),
  1,
  'once bob genuinely accepts, mallory can read his opted-in shared_stats row'
);
reset role;

select * from finish();
rollback;
