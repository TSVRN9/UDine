-- #260 part 2: the backfill in 20260825130000_display_name_not_email_default.sql. Same local-stack
-- limitation as 20260824160000's own "Finding 3" backfill (its own comment: "a no-op on this
-- repo's local test dbs, which have no pre-existing rows at migration time") -- `supabase db reset`
-- replays every migration against an empty database, so by the time this test file's transaction
-- starts, handle_new_user has ALREADY stopped producing email-shaped display_names (proven in
-- 01_profiles_trigger.sql) and there is no genuinely pre-existing leaked row for the backfill UPDATE
-- to have caught. To still prove the backfill's own SQL is correct rather than just asserting it
-- ran (it did, trivially, against zero rows), this file manufactures legacy-shaped rows -- the
-- exact shape a pre-fix signup would have left, for each raw_user_meta_data case that matters --
-- then re-runs the migration's own backfill statement verbatim. Not an AMBIENT test of the shipped
-- migration re-running itself (that already happened, against nothing); it IS a genuine red/green
-- proof that the UPDATE's derivation matches handle_new_user's own: red before the (fabricated)
-- leaked state is fixed, green after.
--
-- Review finding on the first version of this migration: the backfill unconditionally overwrote
-- every leaked row with the literal 'UMass student', discarding a real Google full_name that was
-- one column away in the very auth.users row the UPDATE already joins (live repro: the one real
-- user had full_name/name = "Owen Wang" but got flattened to "UMass student"). There is no
-- display_name WRITE path anywhere in mobile/web (grepped every public.profiles write -- the full
-- set is discoverable and notifications_enabled), so a leaked row's value can never be a user's
-- deliberate choice to preserve -- but it CAN be a real OAuth name the trigger just never got a
-- chance to write, and that must survive. Three cases below cover exactly that distinction.
create extension if not exists pgtap;

begin;
select plan(5);

-- alice: a Google-shaped signup (full_name/name populated) whose display_name somehow ended up
-- leaked anyway (e.g. she signed up before this fix). The backfill must recover her real name from
-- auth.users, not flatten her to the placeholder.
-- bob: an email/password signup -- raw_user_meta_data is genuinely '{}', same as this repo's own
-- fixtures. No name to recover; 'UMass student' is the correct, only-available outcome.
-- carol: an OAuth-shaped payload with a blank full_name (empty string, not absent) -- proves the
-- nullif('', '') handling matches handle_new_user's exactly, so an empty string doesn't get stored
-- as a "name" no one can see.
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'alice@umass.edu', crypt('x', gen_salt('bf')), '{}', '{"full_name": "Alice Chen", "name": "Alice Chen"}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'bob@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'carol@umass.edu', crypt('x', gen_salt('bf')), '{}', '{"full_name": ""}', now(), now(), '', now());

-- Force all three back to the exact leaked shape (display_name = email local-part), regardless of
-- what the (already-fixed) trigger actually gave them -- simulating rows that predate this fix.
update public.profiles p
set display_name = split_part(u.email, '@', 1)
from auth.users u
where u.id = p.user_id
  and p.user_id in (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003'
  );

select is(
  (select count(*)::int from public.profiles p join auth.users u on u.id = p.user_id where p.display_name = split_part(u.email, '@', 1)),
  3,
  'precondition: all three fabricated legacy rows leak their email via display_name'
);

-- The migration's own backfill statement, verbatim (20260825130000_display_name_not_email_default.sql).
update public.profiles p
set display_name = coalesce(
  nullif(u.raw_user_meta_data->>'full_name', ''),
  nullif(u.raw_user_meta_data->>'name', ''),
  'UMass student'
)
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
  'Alice Chen',
  'a leaked row with a real OAuth full_name recovers it -- never flattened to the placeholder'
);

select is(
  (select display_name from public.profiles where user_id = '00000000-0000-0000-0000-000000000002'),
  'UMass student',
  'a leaked row with no OAuth identity ({}) falls back to the placeholder'
);

select is(
  (select display_name from public.profiles where user_id = '00000000-0000-0000-0000-000000000003'),
  'UMass student',
  'a blank full_name ("") is treated as absent, same as handle_new_user''s own nullif chain'
);

select * from finish();
rollback;
