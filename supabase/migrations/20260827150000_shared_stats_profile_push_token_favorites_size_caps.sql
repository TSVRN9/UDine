-- Issue #327: split off from #228's own round-2/round-3 broadening (that issue's original 3 items --
-- pings constraints, food_sightings retention, verify_jwt pin -- are already fixed via #326).
-- Everything here closes an UNBOUNDED column/row-count surface for a plain authenticated user.
--
-- Reproduced on this branch before any of this migration's changes, against a freshly-reset local
-- DB (see PR body for the full transcript): a 50MB `shared_stats.completion` jsonb insert, a 10MB
-- `profiles.display_name` update, and 100,000 `favorited_foods` rows for one user all succeeded.
-- A 5000-char `push_tokens.token` also succeeded (a token past ~8191 bytes hits Postgres' own btree
-- index-entry-size limit and errors -- but that's an ugly internal error, not a clean rejection, and
-- everything below that limit is currently unbounded).

-- =================================================================================================
-- shared_stats.{completion,top_foods,hall_ranks}: cap each jsonb column's UNCOMPRESSED size at 64KiB.
-- pg_column_size(x) inside a CHECK is evaluated against the datum being written, before TOAST
-- compression is applied to the stored value -- confirmed locally: a CHECK using this predicate
-- rejects a ~100KB *highly compressible* jsonb array (a single repeated character, the same shape
-- the 50MB repro used) even though its compressed on-disk size would land well under 64KiB. That's
-- the semantics this fix wants -- the cost this issue is about (a friend's client downloading and
-- parsing the JSON, not Postgres' disk footprint) scales with the uncompressed payload, not the
-- TOAST-compressed one.
--
-- 64KiB is generous headroom over any real payload: `completion`/`top_foods`/`hall_ranks` are each a
-- flat array of small objects (HallCompletion / TopFoodDisplay / DiningHallRank, see the original
-- migration's own column comments) bounded by "how many dining halls exist" (4) or "how many dishes
-- fit in a top-N list" -- realistically well under 10KB serialized, so 64KiB only ever bites a
-- payload that could not have come from this app's own write path.
--
-- Existing-row remediation: NULL out an oversized column rather than deleting the row or truncating
-- the JSON (which would produce invalid jsonb) -- shared_stats' own "privacy by presence" model
-- (20260820120000_shared_stats.sql) already treats a NULL column as "this stat isn't shared", so
-- degrading an oversized/malformed value to not-shared is the existing, intended degrade path, not a
-- new one invented for this migration. The other two columns and the row itself are untouched.
update public.shared_stats set completion = null where completion is not null and pg_column_size(completion) >= 65536;
update public.shared_stats set top_foods = null where top_foods is not null and pg_column_size(top_foods) >= 65536;
update public.shared_stats set hall_ranks = null where hall_ranks is not null and pg_column_size(hall_ranks) >= 65536;

alter table public.shared_stats
  add constraint shared_stats_completion_size check (completion is null or pg_column_size(completion) < 65536),
  add constraint shared_stats_top_foods_size check (top_foods is null or pg_column_size(top_foods) < 65536),
  add constraint shared_stats_hall_ranks_size check (hall_ranks is null or pg_column_size(hall_ranks) < 65536);

-- =================================================================================================
-- profiles.display_name: cap at 60 chars. Two independent, still-live reasons converge on the same
-- number (round 3, 2026-08-26): (a) it bounds the impersonation text from #268's threat model --
-- `handle_new_user()` (20260825130000_display_name_not_email_default.sql) writes
-- `raw_user_meta_data->>'full_name'` verbatim, and that field is attacker-chosen at signup time; (b)
-- it bounds `send-ping-push`'s title path (`senderName = display_name ?? "A friend"`,
-- supabase/functions/send-ping-push/index.ts:88, used verbatim in the push title with no length
-- guard of its own -- an oversized push already fails gracefully per-chunk after #265, so the impact
-- there is a dropped push rather than a crash, but there's no reason to leave it unbounded once (a)
-- is being fixed anyway). No UI in mobile/web truncates display_name anywhere (grepped every
-- display_name read site) -- there's no existing number to defer to, so 60 (not round 2's earlier,
-- less-considered 64) is taken as the deliberate final value.
--
-- handle_new_user() itself must truncate (not just get backstopped by the CHECK below) -- it fires
-- during the auth.users INSERT trigger, so if it could raise, a real signup whose Google
-- full_name/name happens to be long would abort account creation entirely, turning a storage-bloat
-- fix into an outage for legitimate signups. Truncating here means the CHECK below can never
-- actually fire on this app's own write path; it only ever backstops a hand-rolled write (the same
-- threat model as #271's shared_stats fix), where rejecting outright (not silently truncating
-- someone's directed update) is the correct behavior.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, email)
  values (
    new.id,
    left(
      coalesce(
        nullif(new.raw_user_meta_data->>'full_name', ''),
        nullif(new.raw_user_meta_data->>'name', ''),
        'UMass student'
      ),
      60
    ),
    new.email
  );
  return new;
end;
$$;

-- Existing-row remediation: truncate (not delete -- a profiles row is someone's account, not
-- ephemeral data like a ping) anything already over 60 chars, and repair the one case truncation
-- can't fix -- a zero-length name, which would otherwise violate this constraint's lower bound and
-- has no legitimate origin (handle_new_user's own coalesce chain never produces one; nullif('', '')
-- specifically routes an empty full_name to the next fallback instead).
update public.profiles set display_name = left(display_name, 60) where char_length(display_name) > 60;
update public.profiles set display_name = 'UMass student' where char_length(display_name) = 0;

alter table public.profiles
  add constraint profiles_display_name_length check (char_length(display_name) between 1 and 60);

-- =================================================================================================
-- push_tokens.token: cap at 2048 chars. The two real shapes this column ever holds: an Expo push
-- token (~40-45 chars, e.g. "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]") and a Web Push
-- subscription, stored as `JSON.stringify(subscription.toJSON())` (web/src/lib/pushTokens.ts) --
-- an endpoint URL plus p256dh/auth keys, realistically 300-500 chars. 2048 comfortably exceeds both
-- (>4x the larger real shape) while still bounding storage far below where Postgres' own btree
-- index on push_tokens' primary key (user_id, platform, token) starts throwing its own unfriendly
-- "index row requires N bytes, maximum size is 8191" error (confirmed locally) -- this CHECK turns
-- that into a clean, expected rejection instead.
--
-- Existing-row remediation: delete, not truncate -- a token past 2048 chars was never a real,
-- deliverable push token or subscription (truncating one would just store a different, equally
-- undeliverable string), so there's no legitimate value to preserve.
delete from public.push_tokens where char_length(token) > 2048;

alter table public.push_tokens
  add constraint push_tokens_token_length check (char_length(token) <= 2048);

-- =================================================================================================
-- favorited_foods: cap at 500 rows per user. No existing precedent in this codebase for a favorites
-- ceiling -- the only number on record (1500, in check-favorited-foods/pagination.test.ts) is a
-- mocked-PostgREST bug repro for issue #261, not a designed limit, so it can't be reused as one.
-- 500 comfortably exceeds any realistic favorites list (4 dining halls' worth of menus, realistically
-- well under a few hundred distinct dishes system-wide) while bounding the unbounded-row-count
-- surface this issue is about.
--
-- A per-user row cap cannot be a plain CHECK constraint (Postgres CHECKs can't reference other rows
-- via a subquery -- "cannot use subquery in check constraint"), so this needs a trigger. It's
-- STATEMENT-level with a transition table, not ROW-level, for efficiency, not correctness: a
-- row-level BEFORE INSERT trigger's own count(*) DOES see rows already inserted earlier in the same
-- statement (Postgres' command counter increments per row within a statement), so it would reject a
-- 100,000-row bulk insert correctly too -- but it would do so by running its own count(*) query
-- once per row, i.e. 100,000 separate queries against the same bulk insert. The
-- `referencing new table as new_rows` transition table lets this trigger fire ONCE per statement and
-- check all inserted rows in a single query, which is the only reason it's used here (verified
-- locally that both versions correctly reject a 100,000-row insert and allow a legitimate
-- delete-then-reinsert resync at exactly the cap).
create or replace function public.enforce_favorited_foods_cap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.favorited_foods f
    where f.user_id in (select distinct user_id from new_rows)
    group by f.user_id
    having count(*) > 500
  ) then
    raise exception 'favorited_foods: a user cannot have more than 500 favorited dishes';
  end if;
  return null;
end;
$$;

-- Existing-row remediation: for any user already over the cap, keep their 500 most recently
-- favorited dishes and drop the rest -- same "keep the newest, deterministic tiebreak" shape as
-- 20260825140000_register_push_token.sql's own dedup step.
delete from public.favorited_foods
where (user_id, dish_name) in (
  select user_id, dish_name
  from (
    select user_id, dish_name,
      row_number() over (partition by user_id order by created_at desc, dish_name desc) as rn
    from public.favorited_foods
  ) ranked
  where rn > 500
);

drop trigger if exists favorited_foods_cap on public.favorited_foods;
create trigger favorited_foods_cap
  after insert on public.favorited_foods
  referencing new table as new_rows
  for each statement execute function public.enforce_favorited_foods_cap();
