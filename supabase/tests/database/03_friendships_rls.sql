-- Port of CLAUDE.md's manual verification: "a third party can't read others' friendships".
create extension if not exists pgtap;

begin;
select plan(3);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@umass.edu',   crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carol@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

-- Seeded directly as postgres (bypasses RLS) so this file tests SELECT visibility in isolation from
-- request_friendship / insert-policy behaviour, which 02_request_friendship.sql already covers.
insert into public.friendships (user_a, user_b, status, requested_by)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'accepted', '00000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select is(
  (select count(*)::int from public.friendships
     where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002'),
  1,
  'a participant (user_a) can read their own friendship row'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select is(
  (select count(*)::int from public.friendships
     where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002'),
  1,
  'the other participant (user_b) can also read the friendship row'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003"}';
select is(
  (select count(*)::int from public.friendships
     where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002'),
  0,
  'a third party cannot read another pair''s friendship row'
);
reset role;

select * from finish();
rollback;
