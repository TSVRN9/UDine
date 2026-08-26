-- Port of CLAUDE.md's manual verification: "trigger fires" (on_auth_user_created ->
-- handle_new_user) auto-creates a public.profiles row when a new auth.users row appears.
--
-- #260: display_name used to default to split_part(email, '@', 1) -- since the domain is a
-- constant (@umass.edu), that meant display_name WAS the email for anyone who never renamed, and
-- it sits on the table-wide SELECT grant / discoverable=true policy arm (20260825120000), so it
-- was a 1-query email dump. AMBIENT assertions per #222 -- this reads the real, already-migrated
-- handle_new_user (20260825130000), not a copy re-declared in this file.
create extension if not exists pgtap;

begin;
select plan(5);

-- alice: no OAuth name in raw_user_meta_data (the shape this repo's own test fixtures have always
-- used, and the only shape confirmed on file -- see 20260825130000's own comment on why 'UMass
-- student' is the fallback, not a verified-live Google key).
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'alice@umass.edu', crypt('password', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

-- bob: a full_name IS present in raw_user_meta_data -- proves the coalesce arm is actually wired,
-- not just the 'UMass student' fallback.
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'bob@umass.edu', crypt('password', gen_salt('bf')), '{}', '{"full_name": "Bob Chen"}', now(), now(), '', now());

select ok(
  exists(select 1 from public.profiles where user_id = '00000000-0000-0000-0000-000000000001'),
  'profiles row is auto-created by the on_auth_user_created trigger'
);

select isnt(
  (select display_name from public.profiles where user_id = '00000000-0000-0000-0000-000000000001'),
  split_part('alice@umass.edu', '@', 1),
  'display_name does NOT default to the email local-part'
);

select is(
  (select display_name from public.profiles where user_id = '00000000-0000-0000-0000-000000000001'),
  'UMass student',
  'no OAuth name present -> falls back to the non-email-derived default'
);

select is(
  (select display_name from public.profiles where user_id = '00000000-0000-0000-0000-000000000002'),
  'Bob Chen',
  'raw_user_meta_data.full_name, when present, is used as display_name'
);

-- #248 Part B (2026-08-26): the column default flipped false -> true
-- (20260826140000_notifications_enabled_default_on.sql) -- existing rows are unaffected (a column
-- default only applies to future inserts), but every NEW row, including alice's above, gets true now.
select is(
  (select notifications_enabled from public.profiles where user_id = '00000000-0000-0000-0000-000000000001'),
  true,
  'notifications_enabled now defaults to true (#248)'
);

select * from finish();
rollback;
