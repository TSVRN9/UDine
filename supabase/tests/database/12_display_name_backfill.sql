-- #260 part 2: the backfill in 20260825130000_display_name_not_email_default.sql. Same local-stack
-- limitation as 20260824160000's own "Finding 3" backfill (its own comment: "a no-op on this
-- repo's local test dbs, which have no pre-existing rows at migration time") -- `supabase db reset`
-- replays every migration against an empty database, so by the time this test file's transaction
-- starts, handle_new_user has ALREADY stopped producing email-shaped display_names (proven in
-- 01_profiles_trigger.sql) and there is no genuinely pre-existing leaked row for the backfill UPDATE
-- to have caught. To still prove the backfill's own SQL is correct rather than just asserting it
-- ran (it did, trivially, against zero rows), this file manufactures a legacy-shaped row -- the
-- exact shape a pre-fix signup would have left -- by updating a freshly-trigger-created profile
-- back to display_name = email-local-part, then re-runs the migration's own backfill statement
-- verbatim. Not an AMBIENT test of the shipped migration re-running itself (that already happened,
-- against nothing); it IS a genuine red/green proof that the UPDATE's WHERE clause and rewrite are
-- correct: red before the (fabricated) fix, green after.
create extension if not exists pgtap;

begin;
select plan(4);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'alice@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'bob@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

-- Simulate a pre-#260 row: force alice's display_name back to her email local-part, the exact
-- shape the old handle_new_user would have left. bob is renamed to something that merely
-- COINCIDES with a real name (not his local-part) -- he must survive the backfill untouched, same
-- as the migration's own "don't overwrite a deliberate choice" comment says.
update public.profiles set display_name = split_part((select email from auth.users where id = '00000000-0000-0000-0000-000000000001'), '@', 1)
  where user_id = '00000000-0000-0000-0000-000000000001';
update public.profiles set display_name = 'Bob Chen' where user_id = '00000000-0000-0000-0000-000000000002';

select is(
  (select count(*)::int from public.profiles p join auth.users u on u.id = p.user_id where p.display_name = split_part(u.email, '@', 1)),
  1,
  'precondition: exactly the fabricated legacy row leaks its email via display_name'
);

-- The migration's own backfill statement, verbatim (20260825130000_display_name_not_email_default.sql).
update public.profiles p
set display_name = 'UMass student'
from auth.users u
where p.user_id = u.id
  and p.display_name = split_part(u.email, '@', 1);

select is(
  (select count(*)::int from public.profiles p join auth.users u on u.id = p.user_id where p.display_name = split_part(u.email, '@', 1)),
  0,
  'after backfill: no row has display_name = email local-part'
);

select is(
  (select display_name from public.profiles where user_id = '00000000-0000-0000-0000-000000000001'),
  'UMass student',
  'the leaked row is rewritten to the same non-email-derived default new signups get'
);

select is(
  (select display_name from public.profiles where user_id = '00000000-0000-0000-0000-000000000002'),
  'Bob Chen',
  'a user who already renamed (even to something name-shaped) is left untouched'
);

select * from finish();
rollback;
