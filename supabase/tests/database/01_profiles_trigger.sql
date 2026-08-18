-- Port of CLAUDE.md's manual verification: "trigger fires" (on_auth_user_created ->
-- handle_new_user) auto-creates a public.profiles row when a new auth.users row appears.
create extension if not exists pgtap;

begin;
select plan(3);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'alice@umass.edu', crypt('password', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

select ok(
  exists(select 1 from public.profiles where user_id = '00000000-0000-0000-0000-000000000001'),
  'profiles row is auto-created by the on_auth_user_created trigger'
);

select is(
  (select display_name from public.profiles where user_id = '00000000-0000-0000-0000-000000000001'),
  'alice',
  'display_name defaults to the email local-part'
);

select is(
  (select notifications_enabled from public.profiles where user_id = '00000000-0000-0000-0000-000000000001'),
  false,
  'notifications_enabled defaults to false'
);

select * from finish();
rollback;
