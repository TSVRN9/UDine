-- Issue #327: unbounded column/row sizes split off from #228's own round-2/round-3 broadening.
-- Covers, per the migration's own header comment for full context on each choice:
--   (a) shared_stats.{completion,top_foods,hall_ranks} jsonb size cap (< 64KiB uncompressed)
--   (b) profiles.display_name length cap (1-60 chars), including that handle_new_user() truncates
--       rather than ever tripping the CHECK on a real signup
--   (c) push_tokens.token length cap (<= 2048 chars)
--   (d) favorited_foods per-user row cap (500), enforced by a statement-level trigger
--
-- Per #222's convention: ambient existence checks first (reading what actually shipped), then
-- behavioral checks as a real authenticated write.
create extension if not exists pgtap;

begin;
select plan(23);

-- =================================================================================================
-- Ambient state.
-- =================================================================================================

select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.shared_stats'::regclass and conname = 'shared_stats_completion_size'),
  'shared_stats_completion_size check constraint exists'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.shared_stats'::regclass and conname = 'shared_stats_top_foods_size'),
  'shared_stats_top_foods_size check constraint exists'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.shared_stats'::regclass and conname = 'shared_stats_hall_ranks_size'),
  'shared_stats_hall_ranks_size check constraint exists'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_display_name_length'),
  'profiles_display_name_length check constraint exists'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.push_tokens'::regclass and conname = 'push_tokens_token_length'),
  'push_tokens_token_length check constraint exists'
);
select ok(
  exists (select 1 from pg_trigger where tgrelid = 'public.favorited_foods'::regclass and tgname = 'favorited_foods_cap'),
  'favorited_foods_cap trigger exists'
);

-- =================================================================================================
-- Behavioral: as a real authenticated write, mirroring the RLS-gated repro from the migration/PR.
-- =================================================================================================

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

-- handle_new_user's own signup path: a real, if unusually long, OAuth full_name must never abort
-- account creation -- it gets truncated to 60, not rejected. This is the exact scenario the
-- migration's own comment warns a bare CHECK (with no truncation in handle_new_user) would break.
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@umass.edu', crypt('x', gen_salt('bf')), '{}', jsonb_build_object('full_name', repeat('B', 200)), now(), now(), '', now());

select is(
  (select char_length(display_name) from public.profiles where user_id = '00000000-0000-0000-0000-000000000002'),
  60,
  'a 200-char OAuth full_name is truncated to 60 by handle_new_user, not rejected -- signup still succeeds'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';

-- shared_stats: a ~100KB, highly-compressible jsonb array (same shape as the 50MB repro) is
-- rejected on its uncompressed size, even though it would TOAST-compress to well under 64KiB.
select throws_like(
  $$insert into public.shared_stats (user_id, completion) values ('00000000-0000-0000-0000-000000000001', jsonb_build_array(to_jsonb(repeat('x', 100000))))$$,
  '%shared_stats_completion_size%',
  'an oversized (uncompressed) completion payload is rejected'
);
select lives_ok(
  $$insert into public.shared_stats (user_id, completion) values ('00000000-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('hallTid', 1, 'loggedDistinct', 5, 'seenDistinct', 10)))$$,
  'a normal-sized completion payload still inserts fine'
);
select throws_like(
  $$update public.shared_stats set top_foods = jsonb_build_array(to_jsonb(repeat('y', 100000))) where user_id = '00000000-0000-0000-0000-000000000001'$$,
  '%shared_stats_top_foods_size%',
  'an oversized top_foods payload is rejected'
);
select throws_like(
  $$update public.shared_stats set hall_ranks = jsonb_build_array(to_jsonb(repeat('z', 100000))) where user_id = '00000000-0000-0000-0000-000000000001'$$,
  '%shared_stats_hall_ranks_size%',
  'an oversized hall_ranks payload is rejected'
);

-- profiles.display_name: a direct write (the hand-rolled-PostgREST threat model, same as #271) is
-- rejected outright rather than silently truncated.
select throws_like(
  $$update public.profiles set display_name = repeat('n', 61) where user_id = '00000000-0000-0000-0000-000000000001'$$,
  '%profiles_display_name_length%',
  'a 61-char display_name update is rejected'
);
select lives_ok(
  $$update public.profiles set display_name = repeat('n', 60) where user_id = '00000000-0000-0000-0000-000000000001'$$,
  'a 60-char display_name (the cap itself) is accepted'
);
select throws_like(
  $$update public.profiles set display_name = '' where user_id = '00000000-0000-0000-0000-000000000001'$$,
  '%profiles_display_name_length%',
  'an empty display_name is rejected (lower bound)'
);

-- push_tokens.token: a 2049-char token is rejected; 2048 (the cap) and a realistic Expo-shaped token
-- both still work.
select throws_like(
  $$insert into public.push_tokens (user_id, platform, token) values ('00000000-0000-0000-0000-000000000001', 'web', repeat('t', 2049))$$,
  '%push_tokens_token_length%',
  'a 2049-char push token is rejected'
);
select lives_ok(
  $$insert into public.push_tokens (user_id, platform, token) values ('00000000-0000-0000-0000-000000000001', 'web', repeat('t', 2048))$$,
  'a 2048-char push token (the cap itself) is accepted'
);
select lives_ok(
  $$insert into public.push_tokens (user_id, platform, token) values ('00000000-0000-0000-0000-000000000001', 'expo', 'ExponentPushToken[abcdefghijklmnopqrstuv]')$$,
  'a real-shaped Expo push token is accepted'
);

-- favorited_foods: the exact 100,000-row bulk-insert shape from the red repro is rejected; a bulk
-- insert at (and a delete-then-reinsert resync at) exactly the 500-row cap both still succeed.
select throws_like(
  $$insert into public.favorited_foods (user_id, dish_name) select '00000000-0000-0000-0000-000000000001', 'Dish ' || g from generate_series(1, 100000) g$$,
  '%favorited_foods: a user cannot have more than 500 favorited dishes%',
  'a 100,000-row bulk insert (the red repro''s own shape) is rejected'
);
select is(
  (select count(*)::int from public.favorited_foods where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'the rejected bulk insert left no partial rows behind (statement rolled back whole)'
);
select lives_ok(
  $$insert into public.favorited_foods (user_id, dish_name) select '00000000-0000-0000-0000-000000000001', 'Dish ' || g from generate_series(1, 500) g$$,
  'a 500-row bulk insert (the cap itself) is accepted'
);
select lives_ok(
  $$delete from public.favorited_foods where user_id = '00000000-0000-0000-0000-000000000001'$$,
  'sanity: alice can delete her own favorited_foods rows'
);
select lives_ok(
  $$insert into public.favorited_foods (user_id, dish_name) select '00000000-0000-0000-0000-000000000001', 'Dish ' || g from generate_series(1, 500) g$$,
  'a delete-then-reinsert resync at exactly the cap (syncFavoritedFoods'' own pattern) still succeeds'
);
select throws_like(
  $$insert into public.favorited_foods (user_id, dish_name) values ('00000000-0000-0000-0000-000000000001', 'One Too Many')$$,
  '%favorited_foods: a user cannot have more than 500 favorited dishes%',
  'the 501st row for a user already at the cap is rejected'
);

reset role;

select * from finish();
rollback;
