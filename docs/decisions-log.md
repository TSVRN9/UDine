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
