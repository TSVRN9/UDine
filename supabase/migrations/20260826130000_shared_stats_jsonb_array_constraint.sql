-- #271: shared_stats' three check constraints only rejected the JSON *null* literal, not any other
-- non-array jsonb shape. The owner "for all" RLS policy lets a signed-in user upsert any shape via
-- PostgREST, so an accepted friend could write a string/object/number into
-- completion/top_foods/hall_ranks. mobile/src/app/friend/[id].tsx assumed each field was either
-- SQL NULL or an array and called `.map()` on it with no `Array.isArray` guard, so a malformed row
-- crashed the friend-profile screen for whoever read it.
--
-- Tightens each constraint to "SQL NULL (not shared) or a JSON array" -- the only two shapes the
-- app ever writes -- instead of "anything but the JSON null literal". jsonb_typeof(x) = 'array' is
-- never true for a JSON null, so "privacy by presence" (SQL NULL means not-shared; a JSON null
-- literal is still impossible to store) is unchanged -- see the original migration's own comment on
-- why that distinction matters. This does NOT validate array *elements* (e.g. a top_foods entry
-- with a non-numeric score) -- that's a client-side guard instead, in
-- mobile/src/app/friend/[id].tsx, the only current reader.
--
-- Existing-row guard: #271's own report says live has 0 rows violating this today -- not
-- independently re-confirmed here, since (per shared_stats' own precedent) this migration is
-- LOCAL-only until this PR is reviewed and applied, and applying it is the moment that would need
-- a fresh live check anyway. The only current writer (mobile's syncSharedStat, called from
-- privacySettings.ts's sharedStatValueForToggle) only ever sends `null` or a genuine array, so a
-- violating row would have to come from something other than this app's own write path -- e.g. a
-- hand-rolled PostgREST call, which is exactly #271's threat model. Decision if a violating row
-- did turn up at apply time: FAIL LOUDLY, not silently null out someone's data out from under
-- them. `alter table ... add constraint ... check (...)` validates every existing row by default
-- (no `not valid`), so a live violation aborts the migration with a "violates check constraint"
-- error naming the row and constraint -- the same signal a human needs to go look before deciding
-- what a bad row means, rather than this migration quietly deciding "null it out" on their behalf.
alter table public.shared_stats
  drop constraint shared_stats_completion_not_json_null,
  drop constraint shared_stats_top_foods_not_json_null,
  drop constraint shared_stats_hall_ranks_not_json_null;

alter table public.shared_stats
  add constraint shared_stats_completion_is_array check (completion is null or jsonb_typeof(completion) = 'array'),
  add constraint shared_stats_top_foods_is_array check (top_foods is null or jsonb_typeof(top_foods) = 'array'),
  add constraint shared_stats_hall_ranks_is_array check (hall_ranks is null or jsonb_typeof(hall_ranks) = 'array');
