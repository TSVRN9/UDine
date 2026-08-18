-- Port of CLAUDE.md's manual verification: "friends can ping each other" / "non-friends are
-- rejected by RLS" — pings insert requires an accepted friendship, enforced in the RLS policy
-- (public.pings "friends can send pings"), not trusted to the client.
create extension if not exists pgtap;

begin;
select plan(6);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@umass.edu',   crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carol@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dave@umass.edu',  crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

-- alice & bob are accepted friends; carol is a stranger to both; alice & dave are still pending
-- (exactly what request_friendship leaves behind before the other side accepts — the realistic
-- mid-state, not a contrived one).
insert into public.friendships (user_a, user_b, status, requested_by)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'accepted', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'pending', '00000000-0000-0000-0000-000000000001');

-- Friends can ping each other.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$insert into public.pings (sender_id, receiver_id, message) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'come eat with me')$$,
  'an accepted friend can send a ping'
);
reset role;

select is(
  (select count(*)::int from public.pings
     where sender_id = '00000000-0000-0000-0000-000000000001' and receiver_id = '00000000-0000-0000-0000-000000000002'),
  1,
  'the ping row was actually inserted'
);

-- The receiver can read it; a non-participant cannot.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select is(
  (select count(*)::int from public.pings where receiver_id = '00000000-0000-0000-0000-000000000002'),
  1,
  'the receiver can read a ping sent to them'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003"}';
select is(
  (select count(*)::int from public.pings where receiver_id = '00000000-0000-0000-0000-000000000002'),
  0,
  'a non-participant cannot read the ping'
);

-- Non-friends are rejected: carol has no friendship with alice at all.
select throws_like(
  $$insert into public.pings (sender_id, receiver_id, message) values ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'hey')$$,
  '%row-level security policy%',
  'a non-friend cannot send a ping (RLS-enforced, not app-trusted)'
);
reset role;

-- A pending (not yet accepted) friendship is not enough either — the policy specifically checks
-- f.status = 'accepted', not just "a friendships row exists".
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000004"}';
select throws_like(
  $$insert into public.pings (sender_id, receiver_id, message) values ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'hi')$$,
  '%row-level security policy%',
  'a pending (not yet accepted) friendship does not allow pinging'
);
reset role;

select * from finish();
rollback;
