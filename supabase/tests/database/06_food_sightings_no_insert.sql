-- Port of CLAUDE.md's manual verification: food_sightings has no `authenticated` insert policy —
-- it's populated only by the check-favorited-foods Edge Function running as service_role (which
-- bypasses RLS). Confirms a signed-in user genuinely cannot insert a fake sighting for themselves,
-- and that select/update (mark-read) still work normally.
create extension if not exists pgtap;

begin;
select plan(3);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';

-- No insert policy exists at all for `authenticated` -> RLS default-denies every insert, even one
-- that would otherwise satisfy an auth.uid() = user_id check if such a policy existed.
select throws_like(
  $$insert into public.food_sightings (user_id, dish_name, hall_tid, sighted_date) values ('00000000-0000-0000-0000-000000000001', 'Chicken Tenders', 3, current_date)$$,
  '%row-level security policy%',
  'a signed-in user cannot insert their own fake food_sightings row'
);
reset role;

-- Seed a real sighting the way the Edge Function does: as service_role, bypassing RLS.
set local role service_role;
insert into public.food_sightings (user_id, dish_name, hall_tid, sighted_date)
values ('00000000-0000-0000-0000-000000000001', 'Chicken Tenders', 3, current_date);
reset role;

-- The owner can still read it and mark it read (select + update policies both exist and work).
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select is(
  (select count(*)::int from public.food_sightings where user_id = '00000000-0000-0000-0000-000000000001'),
  1,
  'the owner can read a sighting once the service role has inserted it'
);
select lives_ok(
  $$update public.food_sightings set read_at = now() where user_id = '00000000-0000-0000-0000-000000000001'$$,
  'the owner can mark their own sighting read'
);
reset role;

select * from finish();
rollback;
