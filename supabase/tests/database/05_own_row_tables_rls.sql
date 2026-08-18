-- Port of CLAUDE.md's manual verification, generalized to the three "own rows only" tables:
-- favorite_dining_halls, push_tokens, favorited_foods. Each has a single per-owner policy
-- (`auth.uid() = user_id`) for select/insert/update/delete — a user can only read/write their own
-- rows, never another user's.
create extension if not exists pgtap;

begin;
select plan(11);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@umass.edu',   crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

-- Seed one row per user per table, directly as postgres (bypasses RLS) so read-isolation is tested
-- independently of each table's own insert policy.
insert into public.favorite_dining_halls (user_id, hall_tid, rank) values
  ('00000000-0000-0000-0000-000000000001', 1, 1),
  ('00000000-0000-0000-0000-000000000002', 2, 1);

insert into public.push_tokens (user_id, platform, token) values
  ('00000000-0000-0000-0000-000000000001', 'web', 'alice-token'),
  ('00000000-0000-0000-0000-000000000002', 'web', 'bob-token');

insert into public.favorited_foods (user_id, dish_name) values
  ('00000000-0000-0000-0000-000000000001', 'Chicken Tenders'),
  ('00000000-0000-0000-0000-000000000002', 'Mac and Cheese');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';

-- SELECT: alice sees only her own row on each table.
select is((select count(*)::int from public.favorite_dining_halls), 1, 'favorite_dining_halls: alice sees only her own row');
select is((select hall_tid from public.favorite_dining_halls limit 1), 1, 'favorite_dining_halls: it is actually alice''s row');
select is((select count(*)::int from public.push_tokens), 1, 'push_tokens: alice sees only her own row');
select is((select token from public.push_tokens limit 1), 'alice-token', 'push_tokens: it is actually alice''s row');
select is((select count(*)::int from public.favorited_foods), 1, 'favorited_foods: alice sees only her own row');
select is((select dish_name from public.favorited_foods limit 1), 'Chicken Tenders', 'favorited_foods: it is actually alice''s row');

-- INSERT: alice can insert her own row but not spoof bob's user_id.
select lives_ok(
  $$insert into public.favorite_dining_halls (user_id, hall_tid, rank) values ('00000000-0000-0000-0000-000000000001', 3, 2)$$,
  'favorite_dining_halls: alice can insert her own row'
);
select throws_like(
  $$insert into public.favorite_dining_halls (user_id, hall_tid, rank) values ('00000000-0000-0000-0000-000000000002', 4, 1)$$,
  '%row-level security policy%',
  'favorite_dining_halls: alice cannot insert a row for bob'
);
select throws_like(
  $$insert into public.push_tokens (user_id, platform, token) values ('00000000-0000-0000-0000-000000000002', 'expo', 'spoofed')$$,
  '%row-level security policy%',
  'push_tokens: alice cannot insert a row for bob'
);
select throws_like(
  $$insert into public.favorited_foods (user_id, dish_name) values ('00000000-0000-0000-0000-000000000002', 'Spoofed Dish')$$,
  '%row-level security policy%',
  'favorited_foods: alice cannot insert a row for bob'
);

-- UPDATE: alice cannot update bob's row (the row-count-affected is 0, no error, since the USING
-- clause simply filters it out of the update target).
update public.favorite_dining_halls set rank = 99 where user_id = '00000000-0000-0000-0000-000000000002';
reset role;

select is(
  (select rank::int from public.favorite_dining_halls where user_id = '00000000-0000-0000-0000-000000000002' and hall_tid = 2),
  1,
  'favorite_dining_halls: bob''s row is unchanged after alice''s update attempt'
);

select * from finish();
rollback;
