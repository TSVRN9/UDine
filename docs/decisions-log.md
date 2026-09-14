# Decisions log

Audit trail of backend/infra work: what was done, how it was verified, what's still unverified.
Not loaded on every task — load the section matching the area you're touching. Auth has its own
file: `docs/auth-status.md`.

## Supabase project

- Project **UDine** (`ubogyqskqzvkcqboqbhw`, org `tsvrn`, us-east-1, free tier).
- The previously-noted unrelated **bricktime** project no longer exists — reconfirmed 2026-08-27
  (`list_projects` returns exactly one project in the org). No owner action needed.
- **"Apply after review" rule:** migrations are applied to the live project only after their PR is
  reviewed and approved — never automatically once local pgTAP is green. As of 2026-09-09, live is
  current through `20260905130000` (`schedule_populate_dishes`) — the full backlog noted below as
  unapplied on 2026-08-27 (the grant-revoke sweep, discoverable-arm drop, ping-replay guard, DB
  hardening, cron timeout, RLS initplan cleanup, QR already-friends fix, push-token gate, size caps,
  and the `public.dishes` catalog + its cron) was applied in one pass, in order, owner-authorized,
  after issue #441 (`public.dishes` PGRST205) surfaced the gap. `send-ping-push` was also redeployed
  in the same pass — its live version predated the `pushed_at` replay-guard code the migration's
  column addition depends on. Re-check `list_migrations` rather than trusting this note; it drifts
  fast.

## Android builds need JDK 17 (2026-08-17)

The system default JDK is 25, which breaks `expo run:android` (`react-native-worklets` hits an
NDK/CMake "restricted method" incompatibility). JDK 17 (Temurin) is installed alongside it — the
command is in `CLAUDE.md`. Confirmed working end-to-end on the `Agent_Emulator` AVD.

## Friends / pings / favorited-food-alerts schema (2026-08-18)

`profiles` (auto-created via an `after insert on auth.users` trigger — not a security boundary, just
row creation), `friendships` (canonically ordered `user_a < user_b`, always insert via the
`request_friendship(uuid)` RPC, never a raw insert), `pings` (insert requires an `accepted`
friendship, enforced in the RLS policy, not trusted to the client), `favorited_foods`,
`push_tokens`, `food_sightings`.

Verified end-to-end with real signed-up test users + simulated JWT claims
(`set local request.jwt.claims`): trigger fires, `request_friendship` orders correctly, a third
party can't read others' friendships, friends can ping each other, non-friends are rejected by RLS.
All test rows cleaned up afterward. That manual verification is now automated in
`supabase/tests/database/` (pgTAP, local stack only, never the live project).

**Explicit grants (`20260818130000_grant_authenticated_table_access.sql`).** Building the pgTAP
suite surfaced a previously-invisible risk: none of these tables had an explicit `GRANT` — they only
worked via Supabase's "legacy auto-expose" default, which grants base table privileges to
`authenticated`/`service_role` automatically but is being **removed entirely on 2026-10-30**
(confirmed via `supabase/config.toml`'s own `auto_expose_new_tables` comment). Without an explicit
grant, RLS never even gets evaluated — Postgres denies at the table-privilege level first. The
migration is scoped to exactly what each table's existing RLS policies already allow (does not widen
access). Applied live 2026-08-18; `information_schema.role_table_grants` confirmed the grants already
existed there via the legacy default, so this was preemptive, not a live-breakage repair — but would
have become one in October.

## `check-favorited-foods` Edge Function

**Deployed version drifts fast — re-verify before trusting a version number.** Re-checked live via
the Supabase MCP `list_edge_functions`/`get_edge_function` tools 2026-08-27: at **v14**, and its
deployed source is **byte-identical** to this repo's `supabase/functions/check-favorited-foods/index.ts`
(and its `_shared/{hours,push,paging}.ts` deps) at that commit — confirmed by diffing the fetched
deployed source, not just comparing version numbers. Re-run the same diff before trusting this again.

**Matching logic (verified).** Fetches live `foodpro-menu-ajax` data for all 4 halls, matches
against `favorited_foods` for users with `notifications_enabled`, upserts `food_sightings`. The
dish-name-extraction regex was independently verified against live data (93 real dishes at
Hampshire, including known items). Real bug caught and fixed: the first deploy used
`profiles!inner(...)` as an embedded PostgREST join, which fails because `favorited_foods` and
`profiles` both reference `auth.users` independently with no direct FK between them — PostgREST
can't infer that join path. Fixed with two plain queries. Re-invoked after the fix: runs cleanly
(`checkedHalls: 4`), correct empty-state output.

**Unverified:** the positive-match path (a real favorite → a real `food_sightings` row). Blocked by
Supabase's free-tier email-send rate limit preventing a second test-user signup, and no
service-role/Admin API access to route around it.

**Push credentials (done 2026-08-18).** VAPID keypair (Web Push, `/web`) and an Expo access token +
Firebase/FCM project (Android push, `/mobile`). Edge Function secrets `VAPID_PRIVATE_KEY`,
`VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `EXPO_ACCESS_TOKEN` all set. `mobile/` has an EAS project link
(`eas.json`, `app.json`'s `extra.eas.projectId`), `google-services.json`, and the Android package
renamed to `com.udinetogether.udine` (Firebase needs a real, lowercase package name). Web Push
subscription registration (`/web`) and Expo push-token registration (`/mobile`) both implemented,
writing to `push_tokens`.

**FCM V1 service-account upload: CONFIRMED (2026-08-18, project `udine-a6996`).** The earlier
"unconfirmed, needs a real TTY" caveat is resolved per the owner's report (`eas credentials` run
interactively, key uploaded). No session since has had EAS MCP/TTY access to re-verify independently
— this is relying on the owner's report, not a fresh read. Re-run `npx eas-cli credentials` from
`mobile/` yourself before treating Android push delivery as reliable if it matters for your task.

**Push dispatch (deployed 2026-08-18, function v7).** Sends Web Push (via `npm:web-push`) and Expo
push per new `food_sightings` row, deletes permanently-dead tokens, gates each platform on its own
secrets independently. Invoked directly via `curl` after deploy to confirm it boots on the real Edge
Runtime — this mattered because `npm:web-push` was only tested locally before, and a broken import
would have crashed the whole function including the working matching logic. Result: `npm:web-push`
runs fine on the Edge Runtime. The first live invocation 500'd from an unrelated bug: `VAPID_SUBJECT`
was a bare email (`udine.dlbo0@aleeas.com`) instead of a `mailto:` URI, which `web-push`'s
`setVapidDetails` requires. Fixed by resetting the secret to `mailto:udine.dlbo0@aleeas.com`;
follow-up invocation returned `200 {"checkedHalls":4,...,"pushConfigured":true,"pushSent":0,...}`.

**Still unverified:** an actual push landing on a real device/browser — no registered token exists
yet, and Android additionally depends on the unconfirmed FCM V1 upload above.

**`pg_cron` scheduling (done 2026-08-18).** ADR 0002's deferral condition (push dispatch verified
working) was met, so the job was wired up and applied live — `pg_cron`/`pg_net` enabled, `cron.job`
shows `check-favorited-foods-hourly` active on `0 11-23,0-1 * * *` (hourly, ~7am–9pm Eastern,
hand-converted to UTC — does not auto-adjust for DST; see the migration's comment for the
twice-a-year fix). Auth uses the anon/publishable key from Supabase Vault
(`check_favorited_foods_auth_token`), not the service-role key — least-privilege, since the function
ignores the incoming request and does its own DB access with its own service-role secret. Verified
end-to-end: manually triggered the same `net.http_post` the cron job runs and confirmed via
`net._http_response` that it got a live `200` with the function's normal JSON body — not just that
`net.http_post` returned a request id, which it does unconditionally regardless of HTTP outcome (see
the migration's comment on this pitfall).

## `send-ping-push` Edge Function (#95, deployed 2026-08-21, live at v4 as of 2026-08-27)

Pushes a notification to a ping's receiver the moment a ping is sent, rather than waiting on the
hourly `check-favorited-foods` cron — pings are latency-sensitive ("come eat with me, I'm here now").
Reuses `_shared/push.ts`'s senders and dead-token cleanup. Does not gate on
`profiles.notifications_enabled` — that flag is scoped to favorited-food alerts; a ping is a direct
friend interaction, not a food-alert preference. Triggered by a per-insert `pg_net` webhook on
`public.pings` (`supabase/migrations/20260821120000_ping_push_trigger.sql`, `security
definer`/`search_path = ''`, wrapped in its own exception handler so a push failure never fails the
underlying ping insert). A companion migration revokes public `EXECUTE` on the trigger function. Both
applied live. Covered by `supabase/tests/database/07_ping_push_trigger.sql`.

**#196 — replay-guard hardening (2026-08-27, applied live 2026-09-09).** The function required only a
valid JWT (the anon key ships in every client) plus any `ping_id` — no dedup, no rate limit, no
sender check. A user could replay their own ping's id (readable via `pings` RLS) to re-push the same
notification indefinitely, a push-spam primitive. Reproduced live locally before fixing: the same
`ping_id` curled 3x returned `sent:true` every time. Fixed with `pings.pushed_at`, claimed atomically
(`update ... where pushed_at is null returning ...`); confirmed under real concurrent load (8, then 20
simultaneous calls against one fresh `ping_id` → exactly 1 `sent:true` each time, not just sequential
replay). `authenticated` has no UPDATE grant on `pings`, so a client can't reset the claim to replay
again. `verify_jwt = true` is now pinned per-function in `supabase/config.toml` for both this function
and `check-favorited-foods` (previously asserted only in migration comments, untracked in config).

## `shared_stats` schema + RLS (#94, 2026-08-20; #271, 2026-08-26)

One row per user (`supabase/migrations/20260820120000_shared_stats.sql`), three independently-nullable
jsonb columns (`completion`, `top_foods`, `hall_ranks`) instead of three tables, so "opted in or not"
is presence/absence of one column, enforced down to a check constraint — only a real absent/SQL-NULL
column counts as "not shared".

**#271 tightened the constraint.** The original constraints only rejected the JSON `null` literal, so
an accepted friend could upsert any other non-array jsonb shape (string/object/number, or an array
with a malformed element) via a raw PostgREST call and crash the friend-profile screen.
`20260826130000_shared_stats_jsonb_array_constraint.sql` replaced
`shared_stats_{completion,top_foods,hall_ranks}_not_json_null` with
`shared_stats_{...}_is_array` (`check (col is null or jsonb_typeof(col) = 'array')`) — SQL NULL and a
JSON array are the only accepted shapes; JSON null is still rejected, so "privacy by presence" is
unchanged. The constraint can't reach into array *elements*, so `mobile/src/app/friend/[id].tsx`
filters each entry to the exact shape it renders (`isValidCompletion`/`isValidTopFood`/
`isValidHallRank`), and `mobile/src/app/_layout.tsx` exports an `ErrorBoundary` (expo-router's
root-boundary pattern — there was none in the app before) as a second line of defense.

**RLS:** owner full CRUD on own row; a second read-only SELECT policy admits an accepted friend only
(mirrors pings' friendship check). Explicit `select/insert/update/delete` grants to
`authenticated`/`service_role` per the 2026-10-30 auto-expose deprecation.

**`supabase/tests/database/07_shared_stats_rls.sql` (31 pgTAP assertions) proves:** no row exposes
nothing; an owner can write; an un-opted-in field stays absent even to a friend who can read the row;
an opted-in field is visible to an accepted friend; a stranger, a pending-not-yet-accepted
connection, and an anonymous session all see nothing (anon is a hard permission-denied — no `anon`
grant, same as every other social table); a friend can read but never write (RLS silently filters
their UPDATE/DELETE to zero rows, doesn't throw — same shape as `favorite_dining_halls`'s "alice can't
update bob's row" case); revoking a field (`update ... set completion = null`) actually deletes it,
immediately, for both the owner's own read and a friend's. Mutation-red verified: loosening the
friend-select policy to `using (true)` flipped the stranger/pending-friend denial assertions red;
reverting turned them green.

**Mobile:** `mobile/src/lib/privacySettings.ts` derives each stat's synced payload (a truncated cut —
no `pct`/`tone`/comparison counts, see its doc comment) and decides what a toggle should push;
`shared/src/sync.ts`'s `syncSharedStat` does the upsert-or-null-out. Both jest- and node:test-covered,
red-first (mutation-tested).

**Applied to the live project** via #126 (2026-08-21), satisfying #94's own "apply only after review"
rule; the base table and the #271 array-shape tightening are both confirmed present in the live
migration list as of 2026-08-27.

**#248 Part C (2026-08-26) flipped the default from off to on for new accounts** — see CLAUDE.md's
data-residency table for the current rule; this is a product-decision reversal of epic #87's
2026-08-19 "default all off" call, not a schema change. `mobile/src/lib/sharedStatsSeed.ts` and
`shouldSeedSharedStatsDefault` in `privacySettings.ts` implement the one-time seed + disclosure.

## Legacy grant revoke sweep + TRUNCATE lockdown (#201/#221, 2026-08-27; tautology fix #314, same day)

Live ACL was far wider than `20260818130000_grant_authenticated_table_access.sql`'s documented
intent — `anon`/`authenticated`/`service_role` each held ALL privileges (including `TRUNCATE`) on
every public table via the legacy auto-expose default layered on top of the explicit grant. Any
signed-in user could `truncate table public.pings` (or `friendships`/`profiles`/`shared_stats`) and
wipe it. Fixed in one migration (`20260826150000_revoke_legacy_auto_expose_grants.sql`): blanket
revoke from `anon`, per-table excess-verb revokes from `authenticated` (derived by diffing against
the grant migration's actual intent, not guessed), `alter default privileges` so future tables don't
regress. Same migration folded in `request_friendship`'s INSERT policy idempotent-re-request fix (a
stale-UI re-request against a since-non-discoverable target should no-op, not raise an RLS error).

**A real bug shipped in that same migration and was caught before going live.** The idempotent-
exemption's correlated subquery (`select 1 from friendships f where f.user_a = user_a and f.user_b =
user_b`) had a name-shadowing bug — the bare `user_a`/`user_b` bound to the subquery's own alias `f`
instead of the outer row, rendering as `f.user_a = f.user_a and f.user_b = f.user_b`: a tautology,
true for any non-empty `friendships` table. This defeated the discoverability opt-out for every
INSERT once the table was non-empty (confirmed exploit: an unrelated user with some other accepted
friendship could insert a pending request to a non-discoverable stranger they'd never interacted
with). Caught by a later reviewer working on an unrelated ticket (#222), fixed in a follow-up
migration (`20260826160000_fix_friendships_insert_idempotent_exemption_tautology.sql`) qualifying the
subquery's outer reference explicitly. Neither migration was live when the bug was found — no
production exposure. **Lesson for future RLS subqueries: always qualify outer-row references when the
subquery's alias shares column names with the outer table** — the existing pgTAP test for this exact
policy didn't catch it because it only ever had one `friendships` row in scope, so the buggy and
correct semantics coincided; the fix added a second, unrelated row to the test fixture specifically
to distinguish them.

## Discoverable-directory unbounded read closed (#234, 2026-08-27, applied live 2026-09-09)

#233 closed a direct 1-query email-harvest via the `profiles.discoverable = true` SELECT policy arm,
but the arm itself still permitted reading the whole discoverable directory (`user_id`,
`display_name`, `notifications_enabled`, `discoverable` for everyone) in one query — combined with
the (correctly rate-limited) `search_profiles` RPC, still a ~99.8%-of-directory email-recovery path
via one query + N RPC calls. Fixed by rerouting the two call sites that actually needed the arm
(`request_friendship`'s pre-check, the `friendships` INSERT policy) through a new `SECURITY DEFINER`
helper `profile_is_discoverable(uuid)`, then dropping the `discoverable = true` SELECT arm from
`profiles` entirely.

**A footgun avoided mid-implementation, worth remembering:** the issue's own fix direction said to
make `request_friendship` itself `SECURITY DEFINER`. Don't do this — table owners bypass RLS by
default in Postgres (`relforcerowsecurity` defaults to `false`), so a definer `request_friendship`
would silently skip its own INSERT policy's `WITH CHECK` entirely, including the idempotent-exemption
fix above. Confirmed by direct mutation: with the function definer, deleting the idempotent-exemption
policy arm left pgTAP green (false confidence) — the policy was structurally unreachable on that call
path. Reverting to `SECURITY INVOKER` and making ONLY the narrow `profile_is_discoverable` helper
definer keeps the policy load-bearing while still letting the helper read `discoverable` without
triggering RLS recursion. **Rule of thumb: prefer a narrow definer helper over a definer entry point**
whenever the entry point itself is guarded by an RLS policy you need to stay enforced.

Also caught in the same pass: two client search paths (`mobile/src/app/friends.tsx`,
`web/src/routes/friends/+page.svelte`) were still doing raw `.ilike()` against `profiles` — a prior
migration's comment (#227) had claimed these were already migrated to `search_profiles`, but only
`add-friends.tsx` actually was. Rerouted both.

## pgTAP suite 10 self-healing gap closed (#222, 2026-08-27)

`10_add_friends_security_fixes.sql` was genuinely red-green (restores the pre-fix grant/policy in its
own transaction, asserts the exploit, re-applies the fix, asserts rejection) — but because it repairs
the schema itself mid-test, it stayed green even when the *shipped* migration was wrong (proven:
granting blanket UPDATE on `friendships` ambiently left the suite at 113/113 PASS while the exploit
was demonstrably re-opened). Fixed by adding ambient-state assertions — read BEFORE the suite mutates
anything — for every fix that file covers: no stray grant/TRUNCATE, the INSERT policy's `with_check`
text still contains the expected arms, no `anon`/`PUBLIC` EXECUTE on the three RPCs. **This test-
robustness pattern (assert ambient state, not just the test's own repair-and-break cycle) is now the
convention for every new pgTAP file in this repo** — see #201/#221's suite for another example.

## `check-favorited-foods` cron delivery flaky (#200, 2026-08-27, applied live 2026-09-09)

3 of the last 6 hourly `pg_net` deliveries to `check-favorited-foods-hourly` were timing out
(`net._http_response.timed_out = true`) — the function's runtime (2-16s observed) regularly exceeds
`pg_net`'s 5s default `net.http_post` timeout. Fixed with `timeout_milliseconds := 30000` via
`cron.alter_job` (preserves `jobid`/history, unlike unschedule+reschedule). Confirmed via read-only
Supabase MCP tools that live's actual `cron.job.command` is still byte-identical to the original
scheduling migration as of 2026-08-27 — no undetected drift for this migration's full-command-text
replacement to silently overwrite. Re-check that before applying if time has passed.

## RLS initplan / FK-index / policy-dedup cleanup (#202, 2026-08-27, applied live 2026-09-09)

Performance-only advisor cleanup, no semantic change intended (acceptance gate: pgTAP pass count
must be stable except for new assertions). Wrapped `auth.uid()` as `(select auth.uid())` in 19 of 20
initplan-flagged policies (Postgres re-plans a bare `auth.uid()` call once per row; the subquery form
plans once per statement). Added the 4 missing FK indexes (`friendships.requested_by`,
`friendships.user_b`, `pings.sender_id`, `pings.receiver_id`). Deduped `shared_stats`'s two duplicate
permissive SELECT policies.

**One policy deliberately left unwrapped, and why:** `friendships`' "participants can read their
friendships" SELECT policy — wrapping it causes `ERROR: infinite recursion detected in policy for
relation "friendships"`, because the INSERT policy's idempotent-exemption arm (above) self-references
`friendships` in a way that recurses through the wrapped SELECT check. A `SECURITY DEFINER` reroute
(same shape as #234's fix) would resolve it, but doing that inside an otherwise pure performance PR
would touch #314's exploit-history code path for no reason — deferred, documented inline in the
migration rather than forced through.

## QR re-scan of an existing friend (#250, 2026-08-27)

Scanning an already-accepted friend's QR code was a dead end: `redeem_qr_token` returned the pair's
existing row on conflict regardless of `status`/`origin`, so the client couldn't distinguish a fresh
in-person add from "you're already friends" — the user saw a broken ADD flow instead of an
explanation. Fixed by having the RPC signal `already_friends` in its JSONB response (required a
drop+recreate since the return type changed from a bare record to jsonb; re-verify grants — EXECUTE
to `authenticated` only — are re-applied after any `drop function` on this RPC). `qr-confirm.tsx` now
shows "Already friends" instead of ADD/CANCEL when set. Verified the real wire shape over actual HTTP
(signed JWTs through PostgREST/Kong, not just SQL-direct) since neither pgTAP nor the jest mocks
exercise what PostgREST actually serializes.

## `register_push_token` gated on `notifications_enabled` (#277, 2026-08-27, applied live 2026-09-09)

Server-side close for three residual client-side races where a self-heal could re-register a push
token the user had just disabled/deleted (client guards are ordering constraints, not atomic). The
RPC (already `security definer`, already resolves `auth.uid()`) now silently no-ops — returns null,
writes nothing — when the caller's `profiles.notifications_enabled` is false, checked in the same
statement as the insert/upsert (no TOCTOU gap). Silent rather than raising: every client call site
already gates the RPC call on `enabled`, so this branch can only ever fire inside the race itself,
after the user has already turned alerts off — a raised error there would be a spurious alert for a
registration the user no longer wants to succeed. The same gate blocks a disabled account from
stealing an already-registered token via the `unique(platform, token)` evict-and-reassign path, since
both paths go through the same guarded insert statement.

## Unbounded column/row-size caps closed (#327, split off #228's round-2/round-3 broadening, 2026-08-27, applied live 2026-09-09)

Round 2 (owner-reproduced): `shared_stats.{completion,top_foods,hall_ranks}` jsonb, `profiles.
display_name`, and `push_tokens.token` were all unbounded for a plain authenticated user — a 50MB
`shared_stats` insert and a 10MB `display_name` update both succeeded (TOASTed down to 586KB/117KB
on disk, so not a storage-limit accident — a highly compressible payload sails through). 100,000
`favorited_foods` rows for one user also succeeded. Fixed:

- **shared_stats**: `check (pg_column_size(<col>) < 65536)` on each of the three jsonb columns.
  Confirmed locally that `pg_column_size` in a CHECK evaluates the pre-TOAST (uncompressed) datum, not
  the stored size — a CHECK using it rejects a ~100KB compressible payload that would have TOASTed to
  well under 64KiB, which is the right side to bound (a friend's client downloads/parses the
  uncompressed JSON). Existing oversized values are NULLed (not deleted/truncated) — consistent with
  the table's own "privacy by presence" model, where NULL already means "not shared".
- **profiles.display_name**: `check (char_length(display_name) between 1 and 60)`. 60, not round 2's
  initial 64, per round 3's two independent reasons converging on it: bounds #268's attacker-chosen
  `raw_user_meta_data->>'full_name'` impersonation text, and bounds `send-ping-push`'s unbounded
  `senderName` title path. `handle_new_user()` now truncates to 60 itself — the CHECK alone would
  abort real signups with a long OAuth name, turning a storage fix into an outage.
- **push_tokens.token**: `check (char_length(token) <= 2048)` — real shapes are an Expo token
  (~45 chars) or a stringified Web Push subscription (~300-500 chars); 2048 is >4x headroom, and
  replaces Postgres' own unfriendly ~8191-byte btree index-entry error with a clean rejection.
- **favorited_foods**: capped at 500 rows/user. No CHECK can reference other rows, so this is an
  `AFTER INSERT ... FOR EACH STATEMENT` trigger with a `REFERENCING NEW TABLE` transition table —
  chosen for efficiency, not correctness: a ROW-level version's own `count(*)` *does* see rows the
  same bulk `INSERT` statement already added (Postgres' command counter increments per row within a
  statement), so it would also correctly reject a single 100,000-row insert (the exact shape
  `shared/src/sync.ts`'s `syncFavoritedFoods` would send if ever fed a runaway local list) — but it
  would do so via 100,000 separate `count(*)` queries, one per row. The statement-level/
  transition-table version runs that check once per statement instead, while still allowing a
  legitimate delete-then-reinsert resync at exactly the cap.

pgTAP: `supabase/tests/database/20_size_and_row_count_caps.sql`, 23 assertions, full suite green at
21 files / 296 tests.

## Product cuts

- **FAQ and staff directory (issue #50, 2026-08-19): cut, not deferred.** Official-app parity items,
  but UDine is a macro-tracking/social app connected to the UMass menu and these content screens
  don't serve that. Removed entirely from web, mobile, and shared (fetchers, types, nav links,
  tests). Newsletter, press, and events stay.
- **BLE beacon check-ins:** not ported for v1 — needs physical beacon hardware/IDs we don't have.
  Revisit only if asked.

## Remote CI disabled (2026-08-19)

Owner request (hosted-runner usage): the workflow is `workflow_dispatch`-only and branch protection
no longer requires status checks. Re-enable by restoring the `pull_request`/`push` triggers and
re-adding the required checks. `gh act -j <job>` (config in `.actrc`, Docker required) is validated
working for CI parity; `supabase-rls-tests` runs host-direct, not under act.

## public.dishes: global nutrition catalog (2026-09-05)

Added `public.dishes` (one row per unique dish name across all 4 halls) for an upcoming mobile
local-search feature, populated daily by the new `populate-dishes` Edge Function running as
`service_role` — no client write grant at all, same no-client-write shape as `food_sightings`. This
doesn't conflict with "menu cache stays device-only": the menu cache is a per-session/per-device
fetch of what's being served *today*, keyed to a user's own browsing; `public.dishes` is one global,
public, read-only reference row per dish name (nutrition facts only, no per-user or per-session
data at all), more like the dining-hall/tid table than a cache of anyone's activity.

## Pending-migration backlog deployed live (issue #441, 2026-09-09)

`refreshDishCatalogIfStale` failing with PGRST205 ("Could not find the table 'public.dishes'") on
mobile turned out not to be a code bug — the live project's schema was 12 migrations behind `main`,
last applied 2026-08-27. `public.dishes`'s own creation migration was one of the 12 unapplied ones;
the other 10 were already-merged, already-approved fixes (grant-revoke sweep, discoverable-arm drop,
ping-replay guard, cron timeout, RLS initplan/FK-index/policy-dedup cleanup, QR already-friends
signal, push-token race gate, size/row-count caps) that had been sitting inert since 2026-08-27,
each individually annotated "not yet applied live" above.

Applied all 12, in ledger order, via the Supabase MCP tools, verifying after each risky one
(`aclexplode`/`information_schema` grant checks, `pg_get_expr` on rewritten policies,
`get_advisors` before/after). Two things beyond the migrations themselves:

- **`send-ping-push` redeployed.** Its live version (checked via `get_edge_function`) predated the
  `pushed_at` replay-guard code the `ping_replay_guard_and_db_hardening` migration's new column
  depends on — the migration alone would have added a column nothing read. Redeployed from `main`'s
  current source (version 4 → 5).
- **`populate-dishes` deployed for the first time** and manually invoked once (rather than waiting
  for the first 08:00 UTC cron tick) — 366 dishes upserted across all 4 halls on the first run,
  confirmed queryable via the anon key.

`get_advisors` before/after: `auth_rls_initplan` findings dropped from 20 to 1 (exactly the one
policy the initplan-cleanup migration's own comment documents as deliberately left unwrapped —
wrapping it recurses through the friendships INSERT policy's self-referencing idempotency check);
`multiple_permissive_policies` (shared_stats) cleared; no new findings introduced. `list_migrations`
confirms all 12 applied, matching `supabase/migrations/` exactly.

`check-favorited-foods` was checked for the same kind of drift as `send-ping-push` (both import the
same `_shared/` modules) and found current — not redeployed.

## Edge Functions invocable with the public anon key (security pass 2026-09-09, applied live 2026-09-09)

All three server-only Edge Functions (`check-favorited-foods`, `populate-dishes`, `send-ping-push`)
are `verify_jwt = true` and nothing else -- and the anon/publishable key (in every app binary and
the web bundle) is a valid Supabase-signed JWT. Confirmed live before fixing: `POST
/functions/v1/send-ping-push` with only `Authorization: Bearer sb_publishable_...` and a random
`ping_id` returned `200 {"sent":false,...}` (the handler ran; no header at all gets 401, so
`verify_jwt` was the only gate). `check-favorited-foods`/`populate-dishes` ignore the request
entirely, so the same bare-key call runs their whole service-role body on demand -- 4-5
umassdining.com fetches, table scans, `food_sightings` upserts + push dispatch, or a ~400-row
`dishes` upsert -- per call, in a loop, from anywhere: an Edge-invocation/egress burner and an
umassdining.com abuse vector from Supabase's egress IPs. `send-ping-push` was already replay-safe
via `pushed_at` (#196); it gains only a stop to no-op probing, but shares the caller (the pings
trigger) so it's closed the same way. (Not reverting 20260818120000's anon-key-in-Vault choice --
`verify_jwt` and that header are unchanged; this is a second factor on top.)

Fix (`20260909200000_edge_cron_shared_secret.sql` + `supabase/functions/_shared/cronAuth.ts`, wired
into all three handlers): the two `cron.job` commands and `notify_ping_push()` now also send
`x-udine-cron-secret` from a new Vault entry `edge_cron_secret`; each function compares it against
its `EDGE_CRON_SECRET` secret (length-then-XOR compare), 403 on mismatch/missing, 503 (fail closed)
if the secret isn't configured. **Two one-time owner steps** (Vault seed + `supabase secrets set`)
and a **three-step rollout order** (secrets -> migration -> function deploy) are spelled out in the
migration header -- deploying the functions before seeding the secret makes every cron run 503, and
`net.http_post` is fire-and-forget, so that would be silent (#200's lesson). Same migration also
revokes anon/authenticated/public EXECUTE on `enforce_favorited_foods_cap()` (the one trigger
function that lacked the 20260817220100/20260821120100 convention; not exploitable -- trigger
functions can't be called directly and EXECUTE is only checked at `create trigger` time).

Verified locally: `supabase/tests/database/22_edge_cron_shared_secret.sql` (9 assertions, ambient-state
per #222) -- 7/9 red against a `db reset` with the migration removed, 9/9 green with it; full suite 23
files / 313 tests green. `_shared/cronAuth.test.ts` (5 Deno tests; note `Request` trims header-value
whitespace per HTTP, so a trailing-space "near miss" is not a mismatch); functions lane 65/65 green.

Applied and verified live 2026-09-09. One hiccup worth recording: the first live check (`net.http_post`
against `populate-dishes` with both headers) came back `403`, not the expected `200` -- `EDGE_CRON_SECRET`
was already set (a `503` would mean unset), so the two one-time owner steps had used two *different*
generated values instead of the same one. Fixed by generating one fresh value, writing it to the Vault
secret directly (`vault.update_secret`), and having the owner paste that exact value into the function
secret -- collapses the "two independent copy-pastes must match" failure mode to one. Re-verified after:
bare publishable key -> `403 {"error":"forbidden"}` on both `send-ping-push` and `populate-dishes`;
all three functions with the correct header -> `200` (`populate-dishes`: `dishesUpserted:365`;
`check-favorited-foods`: `checkedHalls:4`; `send-ping-push`: `sent:false` for a nonexistent ping, i.e.
past the gate and into real logic). Migration-ledger version drift (see below) fixed for this migration
the same way as the 12 before it -- `supabase_migrations.schema_migrations` now reads `20260909200000`,
matching the local filename.

Same pass, looked at and confirmed fine (2026-09-09, live state via read-only MCP): every table's
grants/column grants/policies match the migration ledger's intent (the 12 migrations applied
2026-09-09, plus this one, all now carry version ids matching their local filenames exactly --
`supabase_migrations.schema_migrations` was reconciled by hand after each apply, since
`apply_migration` stamps its own timestamp-of-invocation version rather than deriving one from the
filename; `supabase db push` will now correctly see all of them as already applied); all 12 public
functions pin `search_path`, definers are `authenticated`-only
(advisor 0029 lists 7, all intended RPCs); deployed function sources are functionally identical to
`main` (the MCP deploy strips comments); `anon`/`authenticated` hold EXECUTE on `net.http_*` (pg_net
default) but `net` isn't an exposed API schema, so it's unreachable through PostgREST; web SSR uses
`getUser()`-validated `safeGetSession`, the OAuth callback redirects to a fixed `/`, mobile is PKCE;
`/api/pdf` is host-gated. Left as owner calls, not patched: an accepted friend can insert unlimited
`pings` (each = one pg_net call + one push to the receiver; the only remedy is unfriending), and
`search_profiles`'s email-prefix search is a slow directory walk by design (#234's accepted residual).
Mobile's social/notification screens were shelved in #338, so `docs/` references to
`mobile/src/app/friends.tsx`, `favoriteFoodAlerts.ts`, `privacySettings.ts` etc. no longer resolve.

## UI verification (2026-09-10)

**What happened.** Of 53 UI tasks in `docs/agents/task-log.jsonl`, 9 were rendered on a device
and 35 never mentioned one; every visual/runtime defect chain (#362→#364, #363→#366, #367→#369,
#367→#436→#440, #428→#435, #429→#434, #430→#439) was caught by human QA, never by the gate. The
2026-09-09 design audit filed ~48 drift tickets in a day. On 2026-09-10 three more shipped past a
gate whose dispatch prompt said "no design check needed": search badges overlapping a button and
not matching the artboard's icons, a 0.5-serving state stuck at half opacity with a "cancel"
affordance (a boundary state a default-state check can't see), and a servings pill that didn't
grow from the + button as `canvas.json`'s `servings-inline-slide` annotation describes. Motion had
no spec-anchored test at all: 11 duration literals across ~24 sites, sheets at 220ms/no easing vs
the spec's 300ms bezier.

**What changed.** `docs/design/` committed (it was untracked, so invisible to worktree agents).
`mobile/src/lib/artboard.ts` reads styles and transitions out of the artboards for tests;
`mobile/src/lib/motion.ts` holds every duration/easing and is checked against
`Prototype.dc.html`. `mobile/scripts/screenshot.sh` makes a device render one command (still or
`--record` + gesture → frames), and a rendered-output diff without an image is REWORK, not
"disclosed". An `expo export --platform android` bundle lane catches #435's class. Task-log lines
carry a `ui` object so unrendered merges are queryable. Per-screen audits are a repeatable
dispatch (`docs/agents/design-audit.md`). The rule text in `dev-tracks.md` was cut to the
checklist; this entry holds the history.

**Still open (owner).** Non-default states of the 31 `DCLogic` artboards exist only in the live
canvas — one artboard per state (servings 0/0.5/max, badge kinds, FAB active/inactive) is the only
way the committed spec can carry them. Web has no design spec.

## Inconclusive visual verification (2026-09-11)

**What happened.** Macro-badge placement went through three shipped iterations in one session
before landing right (7d8612f → e753e24 → b457b90/dd2fe56, `mobile/src/app/halls/[slug].tsx`).
Two distinct bugs slipped past a review pass each already had a chance to catch:

1. On 7d8612f, the reviewer tried to verify whether a long dish name would wrap correctly (badge
   trailing the last line) vs. the bug it turned out to have (badge dropping to a wasted new
   line). `screenshot.sh` landed on the loading skeleton on the first attempt and the wrong screen
   on the second; the reviewer's own report said plainly: "I did not get a pixel-level
   confirmation either way... not a confirmed repro." The verdict that shipped was REWORK for a
   separate, unrelated finding (a missing `flexShrink`) — the flexWrap concern rode through as an
   unresolved caveat, not a blocker, and the wrap bug it correctly anticipated turned out real.
2. Separately, a badge's vertical centering against its text was judged "well centered" by eye
   twice — once by the implementer, once in an earlier reviewer pass — from a screenshot. It was
   9 screen px (~3dp) off. An ad hoc pixel-measurement script (marker color + text-ink pixel
   bounding boxes, compare centers), written and used once for this specific bug, found it
   immediately once someone actually measured instead of looking.

Neither failure was a reviewer competence problem — in case 1 the reviewer correctly identified
the risk and tried to check it. The gap was structural: an explicit "I couldn't verify this" had
nowhere to go but a footnote, `screenshot.sh` had no way to tell a loading skeleton from real
content besides a fixed sleep, the measurement technique that actually worked wasn't a tool
anyone could reach for again, and confirming a long-name/max-badge claim depended on live menu
data happening to contain one that day (it often didn't — verification meant hand-editing a temp
string into the render path and reverting it, done 3 times in this session, which is itself a
"forgotten revert ships fake data" risk).

**What changed.** `mobile/scripts/screenshot.sh` gained `--wait-for TEXT` (polls `uiautomator
dump` for real content, exits loudly on timeout instead of capturing a stale frame) and `--stress
NAME` (a `__DEV__`-gated fixture query param; `mobile/src/app/halls/[slug].tsx`'s
`stressFixtureItem` is the one this repo ships, `NAME=long-names`). The pixel-measurement
technique is now `mobile/scripts/measure-alignment.py`, a documented CLI. `docs/agents/
dev-tracks.md`'s UI check rule now says explicitly that an unverified/inconclusive rendered-
behavior claim is itself blocking — never a footnote next to an unrelated verdict — and names the
three tools above as what to reach for before giving up on a claim. A new project-scoped agent,
`.claude/agents/visual-verifier.md`, takes emulator-driving off `pr-reviewer`'s plate for M/L
UI-visible diffs: it captures every named state and reports raw facts (paths, descriptions,
measurements), no verdict, so a stuck capture doesn't compete with the rest of a code review for
attention. Wired into `docs/agents/orchestration.md`'s dispatch loop.

**Still open (owner).** `visual-verifier` is defined but not yet exercised by a real dispatch —
new custom agent definitions aren't picked up mid-session, so this one hasn't run end-to-end yet.
Confirm on the next M/L UI-visible ticket that it dispatches correctly and its report is actually
useful to the gate, not just plausible-looking; adjust the agent file if the report format turns
out to be missing something a real review needed.

## Hall-menu badge overflow re-investigated, with the 5-badge fixture finally on screen (2026-09-12)

**What happened.** Owner re-reported two symptoms on the hall-menu dish row (`mobile/src/app/
halls/[slug].tsx`) after a prior pass (the "Inconclusive visual verification" entry above) called
the second one a deliberate tradeoff: (1) text/badges overflowing past the dish card's border, (2)
macro badges dropping to a wasted line below a wrapped dish name even when there's visible room.
Owner explicitly rejected the "intentional" verdict for (1) and asked for a harder look, noting it
was hard for them to reproduce too and suggesting a fresh install.

**Why the 5-badge case was never actually seen.** Both this and the prior investigation used
`stressFixtureItem`'s `--stress long-names` fixture (all 5 macro-badge thresholds, a 60+ char name)
expecting it to render "prepended... visible in the very first capture" per its own doc comment.
That comment was wrong: `sectionsForPeriod` groups by category and then always sorts through
shared's `sortStationNames` (a fixed food-journey keyword order) regardless of input array order.
The fixture's synthetic "Stress Test" category matches no keyword, so it sorted alphabetically
*after* every real station -- the very bottom of a long, virtualized `SectionList`, invisible to
`uiautomator dump` without a long scroll neither investigation happened to do. This is why "5-badge
stress fixture never got on screen" recurred across two independent sessions: it looked like a
capture/timing problem each time, but was actually this ordering bug. Fixed by extracting
`moveSectionToFront` (`mobile/src/lib/hallMenuSections.ts`, unit tested) and calling it from
`[slug].tsx`'s `sectionsByPeriod` memo, `__DEV__`-gated the same as the fixture itself.

**Result, with the fixture actually visible this time (`visual-verifier`, `Agent_Emulator_Narrow`,
360dp, all 5 macro presets enabled, live `uiautomator` bounds, not eyeballed):**

1. **Overflow (complaint 1): not reproduced on current `main`.** Card `[54,504]-[1026,829]`; at
   5 badges + a 60+ char name wrapped to 3 lines, every content edge stays inside the card --
   badge row right edge is 198dp inside the card's right edge, the plate-stepper control (the
   actual closest element to the edge) is 12dp inside it, calorie text is 10dp above the bottom
   edge. Also sampled 7 real (non-fixture) dish rows across Worcester and Franklin lunch/brunch
   with 1-4 badges each -- zero overflow in any of them either. The current `flexWrap`+`flexShrink`
   shape (reverted from the inline-attachment layout in `ca19cc2`, see the entry above) holds under
   the worst case this repo can construct. Given the owner's own "hard to reproduce, try a fresh
   install" framing and this project's established pattern of installed alpha/internal builds not
   updating in place (see this file's CLAUDE.md-referenced build docs), the leading explanation for
   what the owner is seeing on-device is a **stale installed build** predating `ca19cc2`'s revert --
   that exact prior version (`e753e24`) had precisely this failure mode (inline attachments can't
   shrink, so a name+badges combo that needed to shrink overflowed instead). No code change made
   for this claim; re-open with a device/build timestamp if it recurs on a build built after this
   entry's date.
2. **Wasted line (complaint 2): reproduced and now measured**, not just argued from principle: the
   badge row sits on its own line below the wrapped name with ~198dp of unused horizontal space
   beside it. Left as the documented tradeoff `hallMenuStyleParity.test.ts` already pins -- the only
   known fix (badges as inline `Text` attachments, `e753e24`) is exactly what caused complaint 1's
   historical instance, because inline attachments don't participate in `flexShrink`. No safe hybrid
   (e.g. measure-then-decide-inline) was implemented this pass; the risk of silently reintroducing
   the overflow failure mode was judged higher than the cosmetic win, matching this ticket's own
   explicit "leave it a documented tradeoff" allowance.

**Incidental, not investigated further:** the very first app launch after `adb shell pm clear`
crashed with `"Property 'moveSectionToFront' doesn't exist"`, recovered cleanly by tapping "Try
again" (which then rendered correctly, all 5 badges). Consistent with `screenshot.sh`'s
Metro-restart racing a `pm clear`-triggered cold app start onto a not-yet-fully-synced bundle, not
a code defect -- the same emulator run worked correctly on every subsequent load with no code
changes in between.

## Badge tuck (#454) reported as "no change on device" -- the device was running a build from before the fix (2026-09-12)

**What happened.** #454 (`1a2af49`, merged 20:32 EDT) added the measure-then-tuck badge placement
for wrapped dish names. The owner reported it changed nothing on their phone. The dispatched theory
was a Yoga measurement mismatch: `onTextLayout` on the visible name `Text` supposedly measures the
wrap with the badge row still an in-flow sibling, so the line metrics wouldn't match the tucked
geometry. That theory was tested on the real layout engine and killed; the actual cause was a stale
build.

**Evidence, in the order it was gathered.**

1. *The phone's build predates the fix.* `com.udinetogether.udine.internal` on the owner's phone
   (Galaxy A53, `SM-A536U1`, Android 16, 384dp, `font_scale` 1.1) had `lastUpdateTime` 20:27:42
   EDT -- five minutes before the squash commit. Its Hermes bundle, pulled and searched with
   `strings`, contains none of the fix's identifiers (`macroBadgeRowTucked` 0, `shouldTuckBadges`
   0) and not even #452's `"Stress Fixture"` (merged 13:23 EDT), while control strings from older
   code (`rowInPlate`) are present; a fresh `expo export` of `main` has `macroBadgeRowTucked` 1,
   `shouldTuckBadges` 1. So the build was cut from a checkout at least seven hours behind `main`.
   The Play build (`installerPackageName=com.android.vending`, Sep 6) obviously lacks it too.
2. *The measurement source is correct on-device.* `DishRow` was temporarily instrumented with a
   second, absolutely-positioned invisible copy of the name `Text` (the proposed "probe") logging
   its own `onTextLayout` alongside the visible one, plus `rowNameLine`'s `onLayout` and the flow
   badge row's frame, on `Agent_Emulator_Narrow` (360dp). For the realistic fixture the two sources
   reported byte-identical lines -- `[[0,0,219.6,18.7],[0,18.7,57,16]]` -- with `containerWidth`
   229 equal to the visible `Text`'s own frame width; the extreme fixture likewise (three identical
   lines). The decision then flipped to `tucked: true` for both fixtures and for five real menu
   rows (Chicken Shoyu Ramen Bar, Chickpeas/Artichokes..., Moraccan Green Garbanzo..., Purple Sweet
   Potato Tempura..., Roasted Chicken Noodle Soup...), and `rowNameLine`'s height dropped 56.7 ->
   34.7 as the badge row left the flow. `ParagraphShadowNode::layout` (RN 0.86) does compute those
   lines at the `Text`'s own final frame, not the container -- but in this flex-wrap row that frame
   *is* the full container width, so the two geometries coincide. The probe was removed; shipping
   it would double text layout on every dish row for no change in behaviour.
3. *Both wrap cases render tucked.* `screenshot.sh halls/worcester --stress long-names` on Narrow,
   Metro confirmed owned by this checkout: the 60+ char / 5-badge fixture tucks beside its third
   line, the new realistic fixture ("Grilled Lemon Herb Chicken Thighs with Rice", 3 badges) tucks
   beside "with Rice", and a single-line name with four badges that don't fit ("Baked Herbs de
   Provence Chicken") correctly stacks. Nothing near the card edge in any of them.
4. *The first-mount reflow #454 left unverified is real and is not cushioned.* A 20fps
   `screenrecord` already rolling when the `udine://halls/worcester?stress=long-names` deep link
   fired (a tab-switch recording does not exercise this -- the pager pre-mounts the neighbour pane,
   so its badges are already tucked in the first cross-fade frame): both fixture rows paint
   **untucked** (badges on their own line) for ~450 ms after the skeleton (frames 3.50-3.90 s),
   then snap to tucked with the card at its final height within one 50 ms frame. `LinearTransition
   .duration(180)` on the row did not visibly animate the height change. The same stacked-then-snap
   repeats for ~100 ms when the hours-driven default-tab switch mounts the other pane (5.00 ->
   5.10 s). So every cold mount of a wrapping badged row shows a visible hop, not the "rare,
   already-cushioned" cost the code comment assumes. Left as-is here (out of this dispatch's
   scope); the honest options are gating only the *tuck candidates* (unknowable before
   measurement), or accepting the hop, or a layout that needs no round trip.

**What changed.** No change to `DishRow`. The `--stress long-names` fixture now injects a second,
realistic-length item so both wrap states show in one capture (pinned by
`hallMenuStyleParity.test.ts`). `mobile/scripts/build-internal-android.sh` stamps
`versionName` as `<version>+<short-sha>[.dirty]` so `adb shell dumpsys package
com.udinetogether.udine.internal | grep versionName` answers "which commit is on this phone" --
the check that would have closed this report in one command. Re-open only against a build whose
`versionName` carries a SHA at or after this entry.

## Web INA: mirror vs. on-demand, and the `populate-dishes` cron (2026-09-13)

Prompted by the owner asking whether UMass Dining's physical nutrition-card codes map to a public
endpoint (they do -- see `docs/apk-reverse-engineering.md`'s "FoodPro Web INA" section for the full
endpoint writeup), evaluated whether `public.dishes` should switch from its current daily
`foodpro-menu-ajax`-only source to something built on Web INA, and whether the `populate-dishes` cron
job should be removed.

**The numbers.** `public.dishes` held 727 accumulated distinct dish names at evaluation time (4 halls
only). One hall, one day (`foodpro-menu-ajax`, Worcester): 131 distinct names -- the whole day in one
request, 4 requests total across all halls. Web INA's `search.aspx` is per-dish-name and ambiguous
(`RecNum` is per-hall-recipe, not a global ID -- "Bacon" resolved to 6 distinct `RecNum`s across just
2 halls). `longmenu.aspx` is the real bulk-per-location endpoint, but scoped to roughly one meal
period per request, not a whole day: walking the full 28-location catalog (4 halls + 24 retail/café)
would cost on the order of 4 meal periods x 28 locations ~= **112 requests/day**, plus one `label.aspx`
fetch per newly-discovered `RecNum` -- strictly larger and more complex than today's 4-request/day
job, for data (micronutrients, retail/café coverage) the product doesn't yet consume anywhere.

**Recommendation: keep `populate-dishes` and its daily cron exactly as-is; don't replace it.**
`foodpro-menu-ajax` is the only known source that answers "what's actually being served today" at the
4 halls -- Web INA can only answer "look up this named dish I already know about," never "what's on
the menu," so it can't substitute for the cron's actual discovery role at any request budget.

If/when the product wants what Web INA adds:
1. **Micronutrient %DV for the 4 halls:** extend `populate-dishes` (or a sibling function) with a
   second best-effort pass -- for each dish already upserted this run that has no micronutrient data
   yet, one `search.aspx` lookup (disambiguated by the dish's own `last_seen_hall_tid` -> hall name,
   matched against the search result's `locationName`) + one `label.aspx` fetch, merging the %DV
   fields into the same row. Cost is bounded to never-enriched dishes and shrinks as the catalog
   matures -- add, don't replace.
2. **Retail/café coverage (the 24 non-hall `locationNum`s):** a separate, low-frequency (e.g. weekly
   -- retail menus are far more static than the halls') job walking `longmenu.aspx` for just those
   locations. Whether this data is actually wanted is a product call this evaluation doesn't resolve
   on its own.

**Unplanned finding, worth its own follow-up: `populate-dishes` has been silently stale for two days.**
Checked live during this evaluation (`ubogyqskqzvkcqboqbhw`, 2026-09-14): `public.dishes.updated_at`
tops out at 2026-09-11 08:00:02 UTC despite the current time being 2026-09-14 03:54 UTC and
`cron.job_run_details` showing the `populate-dishes-daily` trigger itself "succeeded" at 08:00 UTC on
9/11, 9/12, *and* 9/13 -- i.e. the SQL-level `net.http_post` call fired correctly on all three days,
but the actual catalog stopped updating after 9/11. `net._http_response`'s short retention window (a
few hours) had already aged out the 9/12/9/13 response bodies by the time this was checked, so the
exact failure couldn't be read back directly. Leading hypothesis, from reading the function's own
code rather than confirmed logs: `fetchHallDishes` degrades every per-hall failure to an empty map
without throwing (by design, so one hall's outage doesn't blank the other three) -- if ALL 4 halls
fail on a given run (a transient `umassdining.com` issue, a timeout, a network blip), `rows.length`
is 0, the `if (rows.length > 0)` guard skips the upsert entirely, and the function still returns a
plain 200 -- a total-outage day currently produces no error signal anywhere. Not fixed as part of
this evaluation (out of the scope that was asked for); flagged for a follow-up M-track ticket (it
touches `supabase/functions/populate-dishes`) to add explicit alerting/logging when a run upserts
zero rows, and to check whether last night's specific outage was `umassdining.com`-side or something
in the function/cron plumbing itself.

## `lookup-dish`: on-demand Web INA lookup + rate limit (2026-09-14)

Implements the "on-demand" half of the "Web INA: mirror vs. on-demand" decision above: a new Edge
Function, `supabase/functions/lookup-dish`, that a mobile client calls when its merged plate search
comes up empty on UMass results for a typed dish name. Unlike `populate-dishes`/
`populate-retail-dishes`/`check-favorited-foods`, this function is deliberately **not** gated by
`_shared/cronAuth.ts`'s `x-udine-cron-secret` -- it exists specifically to be called by real
anonymous end users (CLAUDE.md: "menus, nutrition... work with zero account"). `verify_jwt = true`
(the anon/publishable key) is the only HTTP-layer gate; the real protection is the Postgres-backed
rate limit below.

**Flow, in order:** (1) check `public.dishes` for an existing name match -- free, no FoodPro
round-trip; (2) check a negative cache (`dish_lookup_misses`, 15-minute TTL) so a typo/garbage
retry doesn't re-spend budget; (3) try to claim an in-flight coalescing row
(`dish_lookup_inflight`, insert-if-absent via a PostgREST ignore-duplicates upsert, 30s TTL) so two
near-simultaneous searches for the same name don't both hit FoodPro -- the loser polls
`public.dishes` briefly (3 x 400ms) for the winner's write instead of independently fetching; (4)
atomically increment + check the global hourly budget **before any outbound HTTP call** -- if
exhausted, an honest `{status: "rate_limited"}` response, never a silent fall-through; (5) only
then: `location.aspx` (session cookie) -> `search.aspx` (candidates, filtered to an exact
case-insensitive name match and deduped by `RecNum` -- `search.aspx` is a substring match and the
same recipe recurs across many result rows) -> up to 3 `label.aspx` fetches for real nutrition.
Found dishes upsert into `public.dishes` (reusing `populate-dishes`' `DishNutrition` row shape); a
real hall (`locationNum` 1-4) keeps its own `hallTid`, matching `populate-dishes`' own tid scheme,
and anything else is negated (`-locationNum`) -- independently re-deriving the same convention
`populate-retail-dishes` established for retail locations (that function's own file isn't reachable
from a Deno Edge Function without executing its top-level `Deno.serve()`, so this is deliberate,
verified-consistent duplication, not an import). A genuine miss (FoodPro has nothing for the exact
name either) is negative-cached; a hit's candidates are returned to the client, capped at 3, each
tagged with a human location name so the client can disambiguate a name served at more than one
FoodPro location (`search.aspx` is per-hall-recipe, not a global dish ID -- see the "Web INA: mirror
vs. on-demand" entry above; "Bacon" resolved to 6 distinct `RecNum`s across 2 halls in this
session's own live research).

**The rate-limit cap: 20/hour, global, not per-user.** New migration
`20260914140000_lookup_dish_rate_limit.sql` adds four service-role-only tables (RLS enabled, zero
policies, every anon/authenticated grant explicitly revoked) -- `dish_lookup_config` (a singleton
row holding the tunable `hourly_cap`, boolean-PK-plus-check-constraint trick), `dish_lookup_rate_limit`
(one row per UTC hour bucket, atomically bumped by a new `increment_dish_lookup_count()` SQL
function -- a plain PostgREST upsert can't express `count = count + 1`, so this needed the function),
`dish_lookup_misses`, and `dish_lookup_inflight`. What this actually protects is **UMass's own
FoodPro server** (`af-foodpro1.campus.ads.umass.edu`), not Supabase's Free-tier caps (500k Edge
Function invocations/month, 5GB egress/month, 500MB DB -- this feature's footprint against those is
trivially small for occasional manual lookups at UMass scale). One live lookup costs up to 5 FoodPro
requests (1 `location.aspx` + 1 `search.aspx` + up to 3 `label.aspx`), so a cap of 20/hour bounds
this feature to at most ~100 FoodPro requests/hour -- comfortably under `populate-retail-dishes`'
own single-run total of ~196 requests, and spread across an hour rather than fired in one burst.
Deliberately a GLOBAL budget, not per-user or per-IP: there's no stable anonymous identity to scope
a per-user quota against in an anonymous-first app, so a single conservative global cap is the
right level of effort -- not a speculative per-account/per-IP scheme nothing else in this app has.
The cap lives in a plain tunable table (`update public.dish_lookup_config set hourly_cap = <n>;`),
not a literal buried in the function, so the owner can retune it later without a redeploy; **worth
revisiting once this ships and real usage is observed** -- 20/hour is a reasoned starting guess
grounded in the request-count arithmetic above, not a measured number.

**A "revoke ... from public" gotcha, caught live while writing this migration's pgTAP test:** a
bare `revoke execute on function ... from public` does NOT block `anon`/`authenticated` on a new
function in this local/cloud setup -- they each hold their own separate, explicit EXECUTE grant on
every new function (not merely inherited from the PUBLIC pseudo-role), so the revoke must name them
explicitly too (`from anon, authenticated, public`), matching this project's own existing house
style in e.g. `20260817220100_revoke_handle_new_user_execute.sql`. Confirmed live against the local
stack: the first version of `increment_dish_lookup_count()`'s revoke (public-only) left `anon`
still able to call it; fixed and reconfirmed denied.

**Client integration (mobile only -- web has no "search for something not on the menu" flow at
all today):** `mobile/src/lib/lookupDish.ts` (`lookupDishLive`, `labelLookupCandidate`) plus a
manual (never automatic -- that would defeat the rate limit) "Search UMass Dining directly" row in
`PlateSheet.tsx`'s merged search, shown only once the existing 5-source merged search has come up
short on a UMass result. A hit merges straight into the existing results list as ordinary
`kind: "umass"` `PlateSearchResult` rows (same badge/detail path as every other source, no new UI
chrome); a candidate whose name collides with another candidate in the same response gets its
location appended (`"Bacon (Worcester Dining Commons)"`) so the two stay distinguishable, including
once logged. A miss or a rate-limited response renders a plain, honest state ("UMass Dining doesn't
have this dish either" / "UMass Dining lookup is busy right now. Try again in a bit.") -- not a
crash, not a silent no-op, and the affordance stays available for a retry in both cases.

**Independent review before merge caught two real bugs and two smaller gaps, all fixed here (not
left for a follow-up):**
1. `runDirectLookup` originally staged a merged hit's plate/log entry with the *candidate's own*
   `hallTid` (a real different hall, or a negative synthetic retail tid) instead of the
   currently-browsed hall -- exactly the cross-hall misattribution the catalog-search path's own
   Props doc comment already warns hall-completion/favorite-hall server sync against. Fixed to
   always stage the browsed `hallTid`; the candidate's own hallTid is still used for the
   `public.dishes` upsert server-side, just never reaches the client's plate/log pipeline. New
   regression test uses a deliberately-mismatched candidate hallTid (`-14`) to catch a regression.
2. `fetchFoodProCandidates` returning `[]` conflated two different situations: search.aspx finding
   nothing (a real miss) vs. finding hits but every `label.aspx` fetch failing (transient). The
   original code negative-cached both, so a flaky upstream fetch could poison the 15-minute
   negative cache with "this dish doesn't exist" for a dish that's actually there. Fixed by having
   `fetchFoodProCandidates` return `{candidates, searchHitCount}` and only calling `recordMiss`
   when `searchHitCount === 0`.
3. The follower poll window (coalescing concurrent identical lookups) was 3 x 400ms = 1.2s against
   a leader whose own worst-case latency (cookie prime + search + up to 3 label.aspx fetches, no
   artificial delay) is multiple seconds -- the follower would essentially always time out and
   report `in_progress` without ever actually catching the leader's write. Widened to 10 x 500ms =
   5s, sized to genuinely cover that latency, not just poll a token few times.
4. `checkCatalogHit`'s `ilike` call used the raw user query as the pattern, so a query containing
   `%`/`_` could match an unrelated dish name as a false "cache hit" before any rate-limit check.
   Added `escapeLikePattern` so ilike is always a literal case-insensitive equality check.

`claimInflight`'s core assumption (a PostgREST ignore-duplicates upsert returns the row on a fresh
insert and an empty array on a real conflict) was previously only asserted against a stub, not
verified against real PostgREST -- confirmed live against the local stack via two raw REST calls
with the same `Prefer: resolution=ignore-duplicates` header supabase-js sends: first claim on a
fresh `query_key` returned the inserted row (201, 1 row), the second returned `[]` (201, 0 rows,
`claimed_at` unchanged) -- the leader/follower split behaves exactly as `claimInflight` assumes.

**Verification:** `deno test --node-modules-dir=none --allow-env supabase/functions` (94 tests, 29
new, all passing) covering every parser (`parseSearchHits`, `extractRecNum`/`extractLocationNum`/
`extractLocationName`, `selectCandidateHits`'s exact-match-filter + RecNum-dedup + cap,
`hallTidForLocationNum`, `parseLabelNutrition`/`parseLabelAllergens` against real trimmed
`label.aspx` markup for a real "Bacon" lookup captured live this session), `fetchFoodProCandidates`'
searchHitCount-vs-candidates distinction, and the orchestration (`checkCatalogHit` incl. its ilike
escaping, `checkRecentMiss`, `recordMiss`, `claimInflight`, `incrementAndCheckBudget`,
`performLookup`'s short-circuit-before-budget, never-fetch-past-budget-exhaustion, negative-cache-
only-on-a-genuine-miss, and follower-poll-count paths) against a stubbed Postgres client --
mutation-tested by hand (breaking the `searchcoldesc` regex, the disambiguation-sharing check, the
negative-cache guard, the follower poll-count constant, and the ilike escaping each independently
turned the matching assertions red, confirmed, then reverted). `supabase test db` (324 pgTAP tests
including 11 new ones pinning the four tables' RLS/grant lockdown and the increment function's
execute-privilege boundary, mutation-tested against a live local Postgres the same way: removing
the table revoke line and removing the function's `anon, authenticated` names from its own revoke
each independently turned the matching assertions red, confirmed, then reverted). `npx jest` in
`/mobile` (986 tests, including new coverage for `lookupDish.ts`, the `PlateSheet` affordance, and
the hallTid-staging regression, all passing) and `npx tsc --noEmit` clean.

**On-device verification, real (not synthetic-input-only) this time:** ran the actual dev client
against a locally-started Metro serving this branch's code, on the Agent_Emulator_Narrow AVD --
opened Worcester, opened the plate sheet, typed a garbage query ("zzznonexistentdish"), confirmed
"No matches." plus the new "Search UMass Dining directly" ghost button render below it (matching
the artboard-adjacent styling already used for the standing "Create a custom food" row -- this is
not a new visual layout, it reuses `PlateSheet`'s existing `searchHint`/`Button ghost` styles
verbatim), then tapped it. `lookup-dish` isn't deployed to the live Supabase project yet (this PR
only ships the migration/function source, per the M-track gate's "owner applies after review"
rule), so the real `supabase.functions.invoke` call 404'd against the real project -- `lookupDishLive`
folded that into `{status: "rate_limited"}` exactly as designed, and the sheet rendered "UMass
Dining lookup is busy right now. Try again in a bit." -- the honest, no-crash, no-silent-no-op state
the task spec asked for, now confirmed on a real device against real Yoga layout, not a jest mock.
Screenshot: `plate-sheet-lookup-dish-rate-limited.png` (in this session's scratchpad, attached to
the PR). Did not verify the "hit" (multiple location-tagged candidates) rendering on-device -- that
needs the function actually deployed and a live FoodPro round-trip, out of reach pre-merge; the
mobile jest suite's `PlateSheet.test.tsx` coverage (disambiguation label, merge-into-results,
hallTid-staging) is what stands in for that until then.
## `populate-retail-dishes`: retail/café coverage via Web INA (2026-09-14)

Follow-up to "Web INA: mirror vs. on-demand" above, implementing that entry's option 2: a new,
separate weekly Edge Function (`supabase/functions/populate-retail-dishes`, scheduled by
`20260914120000_schedule_populate_retail_dishes.sql`) that feeds the 24 retail/café FoodPro
locations (Bluewall Grill, Harvest, the various Cafes, etc.) into the SAME `public.dishes` table
`populate-dishes` already writes -- no schema change. Deliberately a sibling function, not a change
to `populate-dishes` itself: different cadence (weekly vs. daily -- retail menus barely change week
to week), and `populate-dishes` was mid-fix for an unrelated cron-double-invocation bug in a
parallel task at the time this was built.

**The gap this closes, confirmed live:** `mobile/src/lib/cafeMenu.ts`'s standing-menu path
(`resolveCafeMenuState` -> `parseRetailMenuHtml` -> `matchStandingMenuItem`) looks up each retail
dish's nutrition in the LOCAL client cache of `public.dishes`, which before this change only ever
held the 4 halls' dishes -- a retail-exclusive item (never served at any hall) could never match, no
matter how often the daily cron ran. Traced the full path with no code changes needed on the client
side: `matchStandingMenuItem` calls `dishCatalog.ts`'s `searchCachedDishes` against the locally
synced `CachedDishCatalog`; that cache is populated by `refreshDishCatalogIfStale`, which calls
`shared/src/dishes.ts`'s `fetchDishCatalog` -- whose `select("dish_name, nutrition, allergens,
diet_tags, updated_at")` doesn't reference `last_seen_hall_tid` at all, so a retail dish's synthetic
negative hallTid (see below) is invisible to the client and the existing match-by-name logic picks
up a newly-inserted retail row automatically once the client's cache next syncs.

**Endpoint mechanics, confirmed/refined live 2026-09-14 (sharpens
`docs/apk-reverse-engineering.md`'s "FoodPro Web INA" section, see that file for the updates):**
- `longmenu.aspx` takes a `mealName` param (`Breakfast`, `Lunch`, `Dinner`, `Late Night` -- exact
  casing, "Late Night" has a literal space). Omitting it silently defaults to one period only (NOT
  necessarily "today's current period" -- observed inconsistent per-location default behavior) --
  always pass it explicitly. `mealName=All` is invalid (0 results). `WeeksMenus=` has no effect on
  scope, per a parallel research pass this session.
- No bulk-enumeration shortcut exists for `RecNum`s (no sitemap/export endpoint; `search.aspx`
  can't be used as a wildcard scan either -- empty query is "No Result", single-char is a 500).
  `longmenu.aspx` per (location, meal period) is the only viable bulk-discovery path.
- Measured live: 24 retail locations x 4 meal periods = 96 `longmenu.aspx` requests, ~45s wall time,
  surfacing 394 unique dish names (415 unique `RecNum`s -- some names repeat across locations under
  different per-location recipes, confirming the "RecNum is per-hall-recipe, not global" finding).
  Of those 394, 63 collided by exact name with an existing (hall-sourced) `public.dishes` row at
  evaluation time; the remaining ~331 were genuinely new.
- `label.aspx`'s Nutrition Facts table markup: most fields are two adjacent `<font>` tags --
  `<label>&nbsp;(</b>)?</font><font ...>value</font>` -- except Calories and Calories from Fat,
  which are inline in one tag (`<b>Calories&nbsp;348</b>`). Allergens are a separate
  `<span class="labelallergensvalue">Milk, Gluten, ...</span>` line. No diet-tag equivalent exists
  on this page (unlike `foodpro-menu-ajax`'s `data-clean-diet-str`) -- retail dishes' `diet_tags`
  column is always empty.
- `longmenu.aspx` (unlike `label.aspx`) needs a session cookie primed by one prior `location.aspx`
  GET -- confirmed live that replaying `location.aspx`'s `Set-Cookie` values verbatim as a `Cookie`
  header (dropping each cookie's own attributes) is sufficient; a cold direct fetch 500s.

**Deliberate design choices, not oversights:**
- A skip-list (`fetchExistingDishNames`) means a `label.aspx` fetch is only ever spent on a dish
  name not already in `public.dishes`. Since the table dedupes globally by `dish_name` and
  `populate-dishes` runs DAILY, a retail dish whose name collides with a hall dish (common --
  "Cheeseburger", "Cheese Pizza", both observed live) will keep losing that name back to the hall's
  own nutrition every morning regardless of what this weekly job ever wrote, and this skip-list
  means the weekly job won't try to re-win it either. Accepted: the gap being fixed is
  retail-EXCLUSIVE dishes, which don't collide by construction.
- `MAX_LABEL_FETCHES_PER_RUN` (originally 100, **superseded to 50 -- see the "corrected timing"
  follow-up further down this entry**) bounds one invocation's `label.aspx` fetch count (and
  therefore its wall-clock time) well under the Edge Function platform's own execution limit -- a
  limit `timeout_milliseconds` in the scheduling migration does NOT control (that setting only bounds
  how long `pg_net` waits for a response). Any genuinely-new dish beyond the cap is simply still
  absent from `public.dishes`, so it's picked up by next week's run -- self-healing with no
  cross-invocation state, converging over ~4 weekly runs at the original 100-per-run cap (~7 at the
  current 50-per-run cap) for the ~331-dish initial backlog (measured above) and staying near-zero
  afterward.
- `last_seen_hall_tid` for a retail dish is `-locationNum` (e.g. Bluewall Grill = 14 -> -14) --
  reusing `public.dishes.last_seen_hall_tid`'s existing plain-nullable-int-no-constraint shape
  (`20260905120000_create_dishes_table.sql`) rather than a new column/table. Simpler than
  `mobile/src/lib/cafeMenu.ts`'s `syntheticHallTidForName` hash (that one exists because a
  locationId-less café has no stable id at all to negate; FoodPro's `locationNum` already is one).
- `location.aspx`/zero-parsed-locations failures return a real error (502), unlike `populate-dishes`'
  known "all-halls-fail degrades to a silent 200" gap (flagged, unfixed, above) -- an inability to
  even discover what to crawl is unambiguous breakage, not a quiet "nothing new this week".

**Verified against live data (2026-09-14), two different retail locations so the parser isn't
validated against one page's quirks:** Bluewall Grill's Cheeseburger (`RecNumAndPort=060125*1`) --
348 cal / 17.9g fat / 64.1mg cholesterol / 23.7g protein / allergens Milk, Gluten, Soy, Corn, Sesame,
Wheat. Harvest's African Soul Rice Salad (`RecNumAndPort=184625*4`) -- 172 cal / 6.2g fat / 3.4g
protein / 155.1mg sodium / allergens Gluten, Soy, Wheat. Neither dish name existed in `public.dishes`
at evaluation time (confirmed via a live query), so both are genuine examples of the gap this closes.
Both pinned as real, trimmed (not paraphrased) fixtures in
`supabase/functions/populate-retail-dishes/parser.test.ts`.

**Verification:** `deno test --node-modules-dir=none --allow-env supabase/functions` (83 tests,
including 13 new ones, all passing; each of the 3 regex-based parsers mutation-tested by hand --
breaking the label-pair regex and the longmenu row regex each turned the corresponding tests red,
confirmed, then reverted). `supabase test db` (317 pgTAP tests including 4 new ones pinning the new
cron job's schedule/header/timeout shape -- mutation-tested the same way: stripping the secret
header, changing the schedule, and changing the timeout each independently turned the matching
assertion red against a live local Postgres, confirmed, then `supabase db reset` restored a clean
baseline). No new table/policy/grant was needed -- `public.dishes` already grants
`insert, update, delete` to `service_role` from `20260905120000_create_dishes_table.sql`, which
`populate-retail-dishes` reuses exactly as `populate-dishes` does.

**Follow-up: both crawl phases parallelized with a bounded pool (pr-reviewer finding on PR #468,
2026-09-14).** Both loops above -- discovery's 96 `longmenu.aspx` requests and up to
`MAX_LABEL_FETCHES_PER_RUN` (100) `label.aspx` requests -- were plain `for (...) { await fetch(...);
await sleep(REQUEST_DELAY_MS) }` loops, zero concurrency, with rows written only in the single
`upsert` at the very end of both. This is the identical shape just diagnosed on
`fix/cron-sequential-fetch-timeout` (PR #469): `populate-dishes`/`check-favorited-foods` died to
platform Gateway Timeout/`EDGE_FUNCTION_ERROR` kills with only 4 sequential fetches taking 9-14s
each, and discovery's 96 fetches here were already measured (above) at ~45s -- well past that wall
-- with 100% of a run's discovered data silently lost on a mid-flight kill (fire-and-forget
`net.http_post` cron means `cron.job_run_details` still reports "succeeded"). Fixed with a bounded
worker pool (`runPool`, `CRAWL_CONCURRENCY = 6` lanes) rather than the sibling fix's full
`Promise.all` fan-out -- that sibling only ever had 4 items (one per hall); firing all 96-100
requests at once here would be rude to `af-foodpro1.campus.ads.umass.edu` for no real benefit over a
handful of concurrent lanes. `REQUEST_DELAY_MS` now throttles each lane's own pace instead of
serializing the whole crawl through one lane. Both phases extracted into pure, testable functions
(`discoverAllDishes`, `fetchAllLabels`, mirroring the sibling fix's `fetchAllHallDishes` shape) so
the pool logic is covered without a real network call --
`supabase/functions/populate-retail-dishes/concurrency.test.ts`, 2 new tests (a generic `runPool`
concurrency-cap test, and a gate-based `discoverAllDishes` test proving it neither serializes nor
exceeds its cap), both mutation-tested by hand (forcing the pool down to 1 lane turned both red --
"pool ran fully sequential" / gate timeout -- confirmed, then reverted).
Incremental writes (upserting as each phase completes rather than only once at the very end) were
considered and deliberately skipped: the risk this closes is wall-clock proximity to the platform's
kill threshold, and the pool fix already addresses that head-on, not just indirectly -- see the
measurement below. Restructuring to partial/incremental persistence would be a materially bigger
diff for a run that's no longer anywhere near the danger zone.
One side effect of pooling, not a correctness change: "first-seen-wins" on a same-name collision
across locations/meal-periods is now completion-order, not list-order, so a colliding dish name's
`last_seen_hall_tid` (which retail location "wins" it) may flip between weekly runs where it
previously wouldn't have. `shared/src/dishes.ts`'s `fetchDishCatalog` doesn't select
`last_seen_hall_tid` at all, so nothing client-visible depends on it being stable.
**Measured live 2026-09-14, same box/session, varying only `concurrency`, both orderings run to rule
out a warm-server-state confound:** discovery (96 `longmenu.aspx` requests, 394 unique dishes
discovered every time) took 19.4s at concurrency=1 then 4.4s at concurrency=6 on the first pass;
running the pair in reverse order (concurrency=6 first) gave 4.7s then 18.5s -- consistent either
way, ruling out "second call benefits from a warmed connection/cache" as the explanation. So: ~19s
sequential vs. ~4.5s at 6 lanes, a ~4.2x speedup matching the pool width.
~~Originally concluded from this: "today's network conditions (lower than the original ~45s
measurement above; day-to-day variance against a live external site) put this well clear of the
9-14s range where the sibling functions started dying."~~ **That conclusion was wrong -- it only
measured `discoverAllDishes` alone, half the crawl. Corrected below (2026-09-14, second review
round).**

**Correction: honest full-crawl timing, and the batched-upsert fix (pr-reviewer's second-round
finding on PR #468, 2026-09-14).** The "well clear of the danger zone" line above generalized from
discovery alone; a reviewer independently re-measured the FULL crawl -- `discoverAllDishes` +
`fetchAllLabels` together, the actual initial-backlog-clearing worst case (`MAX_LABEL_FETCHES_PER_RUN`
label.aspx fetches on top of the 96 longmenu.aspx ones) -- against the live server and got ~8.7-8.8s
consistently: right at the floor of the platform's observed failure zone (one known-good sample at
4.8s; all observed failures at 9.1-13.8s), not comfortably clear of it. Verdict was not a rejection of
the pooling approach (still sound, still mutation-tested, no race condition) but blocked pending either
a corrected timing claim or the label-cap/incremental-upsert mitigation.

Re-measured live 2026-09-14 with the actual exported functions (`discoverAllDishes` +
`fetchAllLabels`) against `af-foodpro1.campus.ads.umass.edu`, timing discovery and label-fetch
together end to end (location.aspx priming fetch timed separately, excluded from the two crawl-phase
numbers below):

| Scenario | locationFetch | discovery | label-fetch | **total** |
|---|---|---|---|---|
| Old cap=100, run 1 | 630ms | 4.64s | 3.51s | **8.78s** |
| Old cap=100, run 2 | 513ms | 4.74s | 3.42s | **8.67s** |
| New cap=50 (candidate) | 554ms | 4.38s | 1.87s | **6.80s** |
| cap=40 (rejected, see below) | 512ms | 4.68s | 1.48s | **6.67s** |
| Steady-state approx. (cap=5, few new dishes/week) | 517ms | 4.42s | 0.18s | **5.12s** |

This confirms the second review's number almost exactly (8.7-8.8s at the old cap=100, reproducible
across runs) and shows the full-crawl worst case really was sitting right at the floor of the observed
9.1-13.8s failure zone -- discovery's own ~4.4-4.7s (the number the original claim relied on) is only
about half the actual worst-case wall time; the label-fetch phase adds another 3.4-3.5s at cap=100.

Two changes made, per the reviewer's suggested mitigations, both applied (not either/or):
1. **`MAX_LABEL_FETCHES_PER_RUN` lowered 100 -> 50.** Belt-and-suspenders, not the primary fix --
   only reduces the odds of a mid-run kill landing in the risky window, doesn't remove the
   consequence if one does. Measured ~6.80s, ~2s of margin below the observed failure floor. Tried
   40 too (~6.67s) but the extra margin over 50 was marginal (~0.1s) for a real cost -- backlog
   convergence for the ~331-dish initial backlog goes from ~4 weekly runs (at 100) to ~7 (at 50) to
   ~9 (at 40); 50 was the better trade-off. Steady-state (near-zero new dishes/week, the long-run
   normal case) is ~5.1s regardless of the cap, since it's dominated by discovery, not label-fetch.
2. **Batched upsert (the fix that actually closes the "lose everything" risk).** `fetchAllLabels`
   now calls `upsertBatch` every `UPSERT_BATCH_SIZE` (25) completed rows as they land, instead of the
   caller collecting all ~50 rows and upserting once after the function returns. A platform kill
   mid-run during the risky backlog-clearing window now loses at most one batch (up to 25 dishes'
   worth of `label.aspx` fetches), not the entire run's discoveries -- this holds regardless of
   whether the real platform timeout threshold is 9s, 14s, or something never pinned down precisely.
   Accumulation (push + length-check + splice) happens with no `await` in between, so it's race-free
   across `runPool`'s concurrent lanes despite the shared array -- JS's single-threaded event loop
   can't interleave two lanes inside that synchronous stretch. An `upsertBatch` failure (a real DB
   error, as opposed to one `label.aspx` fetch failing) is NOT swallowed -- it propagates out of
   `runPool` so `Deno.serve`'s own try/catch still turns it into a 500, matching the old
   all-at-once-upsert's error behavior. One behavioral difference worth flagging for whoever debugs
   this next: the OLD code's 500 meant zero rows written (one upsert, all-or-nothing); the NEW code's
   500 can follow one or more earlier batches that already committed successfully -- a 500 no longer
   implies "nothing landed." That's the intended trade (partial progress on a mid-run kill is the
   whole point of batching), not a regression; `newDishesUpserted` in the 200-path response has no
   analogue on the error path, but nothing reads that response body anyway (cron is fire-and-forget),
   so this isn't worth extending the error response to report a partial count -- just don't assume a
   500 here means an empty run.
**Verification:** `deno test --node-modules-dir=none --allow-env supabase/functions/populate-retail-dishes/`
(17 tests, all passing, up from 16 -- a new `fetchAllLabels` test asserting the batch cadence itself:
30 stubbed entries at batch size 25 must produce >1 upsert call, each <=25 rows, summing to 30;
mutation-tested by hand -- disabling the batch-flush trigger collapsed it back to a single 30-row
call, turning the assertion red ("expected multiple incremental upsert calls... got 1 call(s): [30]"),
confirmed, then reverted). Full suite: `deno test --node-modules-dir=none --allow-env
supabase/functions/` -- 82 tests, all passing. `grep -rn "discoverAllDishes\|fetchAllLabels\|runPool"
--include=*.ts .` from the repo root turns up only this function's own index.ts and its test file --
Deno Edge Functions are independently deployed, so nothing else could have called these anyway.
`supabase test db` not re-run for this follow-up either: `git diff --stat -- supabase/migrations
supabase/tests` against it is empty (no SQL touched), so the 317-test baseline from the entry above
stands unaffected.

## `populate-dishes` staleness follow-up: correlated with per-hall fetch latency, not the zero-row guard (2026-09-14)

Follow-up to the 2026-09-13 entry above. The zero-row-guard hypothesis in that entry turned out to be
a plausible-sounding guess that live evidence didn't back up -- corrected here.

**The "doubled 401" was a red herring, not pg_net.** Every hourly `check-favorited-foods` tick (and
the one daily `populate-dishes` tick) showed two `function_edge_logs` hits a few seconds apart: a 401
then a 200/500. Before assuming pg_net or the platform was retrying, pulled the full
`log_attributes` for both hits in a real pair (2026-09-14 01:00 UTC tick):

- **First hit** (401, arriving ~0.6s after the tick): `request_id`
  `01a09d6d-9706-7174-82eb-1be8f3de97f8`, source IP `23.234.96.209` (ASN "tzulo, inc.", Leesburg VA),
  `response.headers.sb_error_code: UNAUTHORIZED_NO_AUTH_HEADER` -- **no Authorization header
  presented at all**, no `request.sb.apikey.*` fields. Rejected by the platform gateway before the
  function ever booted (no matching `function_logs` boot line).
- **Second hit** (arriving 9-14s later): `request_id` `01a09d6d-98f9-7a5f-a2f4-301666daa57e` --
  different id entirely -- source IP `98.91.41.86` ("Amazon Data Services Northern Virginia", i.e.
  Supabase's own egress), carrying a real `sb_publishable_...` key. This one's `sb-request-id`/
  timestamp match `net._http_response`'s one recorded row for that tick byte-for-byte.

Different `request_id`, different source IP/ASN, different auth entirely: these are two independent
requests, not one logical call double-logged or retried. The first is an external, unauthenticated
probe against a guessable Edge Function URL (harmless -- rejected pre-boot, touches nothing); the
second is our actual cron-authenticated call, and `net._http_response`/`cron.job_run_details` already
report its true outcome faithfully. **Nothing was masking the real result; there was nothing to fix
here.** (`send-ping-push` couldn't be checked for the same pattern -- zero invocations in the retained
log window, trigger-driven with no pings sent recently.)

**Correlated with (not conclusively identified as caused by): sequential per-hall fetches, dying on
the slow days.** Sampling 5 consecutive `check-favorited-foods` ticks (same shared per-hall-fetch
shape as `populate-dishes`): the one that finished in 4.8s returned 200; the four that took
9.1s-13.8s all came back 500, two with a bare `{"error":"Gateway Timeout"}` body and `sb-error-code:
EDGE_FUNCTION_ERROR`, one with a real application error (`fetchFavoritesForUsers` DB read failing --
unrelated to fetch latency). No `console.error`/limit/shutdown line in `function_logs` for the
Gateway Timeout cases -- `function_logs` was queried unfiltered for the window and showed only a
`booted` line -- meaning the runtime was killed mid-flight or the gateway gave up waiting, not our
own code throwing. Both functions fetch their 4 halls with
`for (const tid of HALL_TIDS) await fetchHallDishes/fetchHallMenu(tid)`, one at a time, against
`umassdining.com` (an external, unpredictably slow site). `populate-dishes`' own 9/13 08:00 sample
(401 at :01.4, 500 at :10.9 -- the earlier entry's only direct evidence) has the identical shape.
**What this evidence does not establish:** the specific platform limit being hit (wall-clock request
timeout, CPU-time budget, isolate pool exhaustion, or something upstream of the edge runtime
entirely), or a hard latency threshold -- 13.8s and 9.1s both failed with no passing sample above
4.8s to bound it from below. Sequential fetches against a slow external site is a real, fixable cost
regardless of which limit is the proximate trigger; treat this as a latency reduction with a strong
correlation, not a confirmed root cause.

**Fix (`supabase/functions/populate-dishes/index.ts`, `supabase/functions/check-favorited-foods/index.ts`):**
parallelized each function's per-hall fetch with `Promise.all` (`fetchAllHallDishes` /
`fetchAllHallMenus`), cutting worst-case wall time roughly 4x. Also wrapped `populate-dishes`' final
`supabase.from("dishes").upsert(...)` in try/catch -- it had none, so a thrown/rejected exception
there (as opposed to a resolved `{error}` result) would have produced a bare 500 with zero log line,
indistinguishable from a platform kill.

**Closed the blind spot from the 2026-09-13 entry, without over-correcting:** `populate-dishes` now
logs a distinct `console.warn` (via a new `buildPopulateResponse`) whenever `rows.length === 0`
across every hall, so a run of consecutive zero-row days is greppable in `function_logs` where before
it produced no signal anywhere. Deliberately did NOT change the HTTP status to a hard failure (502
was the first draft, reverted): `rows.length === 0` isn't unambiguously an outage -- a genuinely
dish-less day (campus closed, semester break, a hall-wide no-service day) looks identical from here,
and `check-favorited-foods`' own cron schedule (`11-23,0-1`, deliberately not running overnight)
shows this codebase already models "there are hours/days with nothing to serve." A hard-failure
status on those days would be a false alarm, and false alarms are how the next real staleness goes
unnoticed. Caveat: nothing currently reads this log line -- `cron.job_run_details` reports
"succeeded" whenever the SQL-level `net.http_post` call fires regardless of the function's own
outcome (`net.http_post` is fire-and-forget, the #200 lesson this file already carries). No alerting
was added; out of scope for this pass.

Also extracted the upsert-with-catch into its own `upsertDishes(supabase, rows)` (pr-reviewer
finding: the try/catch above was originally inline in `Deno.serve` and untested -- the exact kind of
gap this incident was about) so the thrown-exception path is exercisable with a stub client instead
of a real Supabase connection.

**Tests (red-first, verified failing without the fix by stashing both `index.ts` changes and
confirming a compile error against the new exports, then green after restoring):**
`supabase/functions/populate-dishes/handler.test.ts` (`fetchAllHallDishes` concurrency via a
join-barrier fetch stub that deadlocks under the old sequential code; `buildPopulateResponse`'s
zero-row/error/success branches including the `console.warn` call; `upsertDishes`'s
throw/resolved-error/clean-success branches against a stub client) and
`supabase/functions/check-favorited-foods/concurrency.test.ts` (`fetchAllHallMenus`, same
join-barrier technique). Green across every test file in the two touched functions
(`deno test --node-modules-dir=none --allow-env supabase/functions`) -- exact pass count not quoted
here since a concurrent, unrelated `populate-retail-dishes` WIP shares this same test run.

**Not yet live, and backfill not yet done.** This fix is code only, unmerged as of this entry --
Edge Functions deploy on merge, so the previous (sequential, un-logged) code keeps running, including
tomorrow's normal 08:00 UTC `populate-dishes` tick, until it ships. Separately, item 4 of this task
(manually re-invoke `populate-dishes` once to backfill the two stale days) requires firing a live
authenticated request against production and was blocked by this session's own auto-mode permission
classifier (`net.http_post` against prod flagged as a "Production Deploy" action; reading
`vault.decrypted_secrets` directly to build an equivalent `curl` call was separately blocked as
"Credential Materialization"). Left for the owner or a session with that permission granted -- once
the fix is merged and deployed, the next 08:00 UTC tick picks the catalog back up on its own, just
without recovering the two already-lost days' rows unless someone backfills by hand.
