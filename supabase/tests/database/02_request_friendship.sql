-- Port of CLAUDE.md's manual verification: "request_friendship orders correctly" (user_a < user_b
-- regardless of who calls it or in which direction), is idempotent, and rejects self-friending.
create extension if not exists pgtap;

begin;
select plan(8);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@umass.edu',   crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carol@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dave@umass.edu',  crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

-- Lower-uuid caller (alice, ...01) requests higher-uuid target (bob, ...02): already in order.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select public.request_friendship('00000000-0000-0000-0000-000000000002');
reset role;

select is(
  (select user_a from public.friendships where requested_by = '00000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'lower-uuid caller requesting higher-uuid target: user_a is the lower uuid'
);
select is(
  (select user_b from public.friendships where requested_by = '00000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-000000000002'::uuid,
  'lower-uuid caller requesting higher-uuid target: user_b is the higher uuid'
);

-- Higher-uuid caller (dave, ...04) requests lower-uuid target (carol, ...03): must still normalize.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000004"}';
select public.request_friendship('00000000-0000-0000-0000-000000000003');
reset role;

select is(
  (select user_a from public.friendships where requested_by = '00000000-0000-0000-0000-000000000004'),
  '00000000-0000-0000-0000-000000000003'::uuid,
  'higher-uuid caller requesting lower-uuid target: user_a still comes out as the lower uuid'
);
select is(
  (select user_b from public.friendships where requested_by = '00000000-0000-0000-0000-000000000004'),
  '00000000-0000-0000-0000-000000000004'::uuid,
  'higher-uuid caller requesting lower-uuid target: user_b still comes out as the higher uuid (the requester)'
);
select is(
  (select count(*)::int from public.friendships
     where user_a = '00000000-0000-0000-0000-000000000003' and user_b = '00000000-0000-0000-0000-000000000004'),
  1,
  'exactly one row exists for the carol/dave pair'
);

-- Idempotency: the target calling request_friendship back should not create a duplicate or flip
-- requested_by.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select public.request_friendship('00000000-0000-0000-0000-000000000001');
reset role;

select is(
  (select count(*)::int from public.friendships
     where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002'),
  1,
  'calling request_friendship back from the other side does not create a duplicate row'
);

select is(
  (select requested_by from public.friendships
     where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002'),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'requested_by is unchanged by the reciprocal call (still the original requester)'
);

-- Self-friending is rejected.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select throws_like(
  $$select public.request_friendship('00000000-0000-0000-0000-000000000001')$$,
  '%cannot friend yourself%',
  'friending yourself raises an exception'
);
reset role;

select * from finish();
rollback;
