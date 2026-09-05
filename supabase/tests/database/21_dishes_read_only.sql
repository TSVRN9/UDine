-- Port of CLAUDE.md's manual verification for public.dishes: a global, read-only reference catalog
-- populated only by the populate-dishes Edge Function running as service_role. Confirms anon and
-- authenticated can both SELECT (search must work signed-out, "anonymous-first"), that
-- authenticated genuinely cannot INSERT/UPDATE/DELETE (RLS/permission-denied), and that a row
-- inserted as service_role is visible via both anon and authenticated SELECT. Mirrors
-- 06_food_sightings_no_insert.sql's RLS/grant-boundary pattern.
--
-- Also pins the populate-dishes-daily cron job's own critical fix (task spec: "do this from the
-- start, don't discover it later") -- same shape as 17_check_favorited_foods_cron_timeout.sql's
-- own two assertions, folded in here rather than a new file since "clients can't write; a cron
-- does" is one coherent story for this table. Mutation-tested, not just presence-tested: with
-- 20260905130000_schedule_populate_dishes.sql's own timeout_milliseconds temporarily changed to
-- 5000, the second assertion below goes red (regex no longer matches "30000"); reverted, it's
-- green again.
create extension if not exists pgtap;

begin;
select plan(8);

select ok(
  exists (select 1 from cron.job where jobname = 'populate-dishes-daily'),
  'populate-dishes-daily cron job is scheduled'
);

select matches(
  (select command from cron.job where jobname = 'populate-dishes-daily'),
  'timeout_milliseconds\s*:=\s*30000',
  'the scheduled net.http_post call sets timeout_milliseconds := 30000 from the start'
);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

-- Nothing exists yet -- anon and authenticated can both run a SELECT (empty result, no error).
set local role anon;
select lives_ok(
  $$select * from public.dishes$$,
  'anon can select from public.dishes even with zero rows'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$select * from public.dishes$$,
  'authenticated can select from public.dishes'
);

-- No insert/update/delete policy exists at all for authenticated -> RLS default-denies, even
-- though there's a base table grant issue too (no insert/update/delete grant to authenticated at
-- all) -- either way the write must fail.
select throws_like(
  $$insert into public.dishes (dish_name, nutrition) values ('Chicken Tenders', '{"calories": 200}'::jsonb)$$,
  '%permission denied%',
  'a signed-in user cannot insert a fake dish row (no insert grant at all)'
);
reset role;

-- Seed a real row the way populate-dishes does: as service_role, bypassing RLS.
set local role service_role;
insert into public.dishes (dish_name, nutrition, allergens, diet_tags, last_seen_hall_tid)
values ('Chicken Tenders', '{"calories": 200}'::jsonb, array['Gluten'], array['Vegetarian'], 3);
reset role;

-- Both anon and authenticated can read the service_role-inserted row.
set local role anon;
select is(
  (select count(*)::int from public.dishes where dish_name = 'Chicken Tenders'),
  1,
  'anon can read a dish row once the service role has inserted it'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select is(
  (select count(*)::int from public.dishes where dish_name = 'Chicken Tenders'),
  1,
  'authenticated can read a dish row once the service role has inserted it'
);
select throws_like(
  $$update public.dishes set updated_at = now() where dish_name = 'Chicken Tenders'$$,
  '%permission denied%',
  'a signed-in user cannot update a dish row (no update grant at all)'
);
reset role;

select * from finish();
rollback;
