-- Issues #196 + #228 (folded per #228 item 3: "overlaps #196; fold together if that lands first").
--
-- #196 -- send-ping-push replay is a push-spam primitive. supabase/functions/send-ping-push/index.ts
-- requires only *a* valid JWT (verify_jwt: true accepts the anon key, which ships in every client --
-- see the config.toml block added below) and any `ping_id`; it never checks the caller's identity
-- against sender_id/receiver_id, so a party to the ping (readable via the "participants can read
-- their pings" RLS policy) can replay the same ping_id to re-push the same notification to the
-- receiver indefinitely. Verified locally before this fix: curling the deployed local function three
-- times with the same ping_id returned `{"sent":true,...}` every time (see PR body for the exact
-- transcript) -- nothing at any layer capped it to one push per ping.
--
-- Fix: pushed_at, checked-and-set atomically by the function itself (`update ... where pushed_at is
-- null returning ...`, done in the same commit as this migration) so a ping can push at most once.
-- `authenticated` has no UPDATE grant at all on public.pings (verified via information_schema and
-- pg_policy before writing this -- only INSERT/SELECT/DELETE, and no UPDATE policy exists), so a
-- client cannot reset pushed_at back to null to re-arm its own ping; only service_role (which the
-- edge function authenticates as) can write it, bypassing RLS same as it always has for this table's
-- other service-role-only paths (see 20260817220000_friends_pings_favorited_foods.sql).
--
-- pings is in the supabase_realtime publication (20260817223000_enable_realtime_on_pings.sql), so
-- this UPDATE now emits a realtime event where the table previously only ever emitted INSERT/DELETE
-- -- both clients' postgres_changes subscriptions filter `event: "INSERT"` only (mobile/src/app/
-- friends.tsx, web/src/routes/notifications/+page.svelte), so the new UPDATE event is inert there,
-- not a duplicate-inbox-row regression.
alter table public.pings add column pushed_at timestamptz;

-- #228 item 1 -- pings.message/hall_tid are unconstrained at the DB. Verified locally before this
-- fix: a 500-char message and a hall_tid of 999 both inserted successfully (only pings_pkey + the
-- two sender/receiver FKs exist, no CHECKs). The only length cap that currently exists anywhere is
-- MAX_MESSAGE_LENGTH = 100 in the push builder (send-ping-push/index.ts:17,33), applied to the push
-- copy only, not enforced on the stored row a receiver can read directly or the sender can replay.
-- Neither client UI caps its message input (mobile only ever sends one of 5 short canned
-- PING_MESSAGES; the web compose box at web/src/routes/notifications/+page.svelte:337 has no
-- maxlength). 280 (not 100) is chosen deliberately: it comfortably exceeds the push builder's
-- existing 100-char cap (so no legitimate ping is ever affected) while still bounding storage/
-- realtime-replication size, rather than baking the push copy's UI-driven number into the schema.
--
-- ADD CONSTRAINT validates every existing row at apply time, and #196's own premise is "a client can
-- already store arbitrary text/hall_tid server-side" -- so this migration cannot assume the live
-- table is already clean. A ping has no history value (it's an ephemeral "come eat with me now",
-- never re-read after the fact the way a chat log would be) and neither client can ever have
-- legitimately produced a row violating either constraint, so deleting any pre-existing violator
-- is the correct behavior, not a data-loss risk -- done immediately before each ADD CONSTRAINT
-- rather than trusted to a pre-flight check the owner has to remember to run by hand.
delete from public.pings where char_length(message) > 280;
alter table public.pings add constraint pings_message_length check (char_length(message) <= 280);

-- hall_tid is nullable (a ping can be sent with no specific hall -- send-ping-push explicitly
-- handles hall_tid is null as "nothing actionable to push"), so this CHECK must accept null and only
-- restrict non-null values to the four real tids (Worcester=1, Franklin=2, Hampshire=3,
-- Berkshire=4 -- CLAUDE.md's Data sources table). `in (...)` already evaluates to null (not false)
-- for a null operand, which Postgres CHECK treats as satisfied, so no explicit `or hall_tid is null`
-- arm is needed here.
delete from public.pings where hall_tid is not null and hall_tid not in (1, 2, 3, 4);
alter table public.pings add constraint pings_hall_tid_valid check (hall_tid in (1, 2, 3, 4));

-- #228 item 2 -- food_sightings has no retention policy; rows (one per user/dish/hall/date) have
-- accumulated forever. Mirrors the existing check-favorited-foods-hourly job's own pattern
-- (20260818120000_schedule_check_favorited_foods.sql) but needs no net.http_post/vault secret at
-- all -- this job runs entirely in SQL, as `postgres` (which already bypasses food_sightings' RLS,
-- same as the check-favorited-foods Edge Function's service-role access), so a straight `delete`
-- is both the smallest and the most honest implementation (no Edge Function round-trip to fail).
--
-- 30 days: food_sightings is in-app notification history (mobile/src/app/notifications.tsx,
-- web/src/routes/notifications/+page.svelte both list it ordered by created_at desc, read/unread via
-- read_at) -- a month of "your favorited dish was spotted" history is generous for a feed nobody is
-- shown is meant to be a permanent record (CLAUDE.md's residency table sanctions the alert itself,
-- not an indefinite server-side log of it), and long enough that no reasonable "did I see this
-- already" UI check could be looking further back.
--
-- Cadence/DST caveat, same as the hourly job: this runs once a day at a fixed UTC hour, so unlike
-- the hourly job's hand-converted Eastern *window*, a single fixed UTC time only ever drifts by the
-- one DST hour twice a year for a job whose whole granularity is "days" -- i.e. even less
-- consequential here than it already was (explicitly "acceptable drift") for the hourly job. Not
-- worth a timezone-aware expression for a background sweep with no user-visible deadline.
select
  cron.schedule(
    'food-sightings-retention-daily',
    '0 9 * * *', -- once daily, 9:00 UTC (~4-5am Eastern depending on DST -- outside dining hours,
                 -- so it never competes with the hourly check-favorited-foods job's own DB load)
    $$
    delete from public.food_sightings where created_at < now() - interval '30 days';
    $$
  );
