# UDine

A calorie/macro tracker for UMass Dining, built as a superset of the official UMass Dining app
(`com.ionicframework.androidumassdining`, actually React Native + Hermes under the hood — see
`docs/apk-reverse-engineering.md`). Two clients, one backend, one shared core.

## Repo layout (monorepo)

```
/web        SvelteKit app
/mobile     React Native (Expo) app
/shared     @udine/shared — types, API clients, macro math, ranking algorithm. Both apps depend on this. Parity comes from sharing this code, not from discipline.
/supabase   migrations, edge functions
/docs       apk-reverse-engineering.md and other reference notes
```

## Local dev note: Android native builds need JDK 17

The system default JDK on this machine is 25, which breaks `expo run:android` (`react-native-worklets`
hits an NDK/CMake "restricted method" incompatibility on JDK 25). JDK 17 (Temurin) is installed
alongside it — build with `JAVA_HOME=/usr/lib/jvm/java-17-temurin-jdk PATH="/usr/lib/jvm/java-17-temurin-jdk/bin:$PATH" npx expo run:android`
from `/mobile`. Confirmed working end-to-end on the `Agent_Emulator` AVD (2026-08-17).

## Backend

- Supabase project: **UDine** (`ubogyqskqzvkcqboqbhw`, org `tsvrn`, us-east-1, free tier).
- An older unrelated project **bricktime** (`nhxsplkkwcscoyhibotc`) still exists in the same org —
  the user asked to delete it, but the Supabase MCP toolset has no `delete_project` call. Delete it
  manually from the dashboard if it's still unwanted; do not attempt to repurpose it.
- **Auth: DONE.** Supabase Auth, Google OAuth provider — client ID/secret configured by the user
  directly in the Supabase dashboard (Authentication > Providers). Verified live (2026-08-17) by
  hitting `GET https://ubogyqskqzvkcqboqbhw.supabase.co/auth/v1/authorize?provider=google`, which
  302s to a real `accounts.google.com` consent screen with the correct callback URL — don't re-verify
  by reading dashboard config (no MCP tool exposes it), re-run this same curl check instead.
  **As of 2026-08-26, the owner also disabled the Email provider live (#268)** — Google is now the
  *only* enabled provider, so "Google OAuth replaces email signup" (see the non-goals section) is no
  longer just a product decision, it's the literal live config. Confirmed non-mutatingly the same
  day: `GET /auth/v1/settings` → `"external":{"email":false,"google":true}`; a live `@umass.edu`
  password signup now gets `400 email_provider_disabled`; the Google authorize redirect above still
  302s correctly.
- **`@umass.edu` restriction — CONFIRMED LIVE (2026-08-17).** Re-tested after the user enabled the
  hook in the dashboard: POSTing a `@gmail.com` signup to `/auth/v1/signup` now correctly gets
  `403 {"msg":"UDine accounts require a @umass.edu email address."}`, not a created user. A parallel
  `@umass.edu` signup was NOT rejected by the hook (no 403/custom-message) — it got past that check and
  hit Supabase's own free-tier email-send rate limit (`429 over_email_send_rate_limit`) instead, a
  separate, expected platform constraint, not a hook bug. No stray test rows were left in `auth.users`.
  Implemented as a
  **Before User Created Auth Hook** (confirmed available on this project) —
  `hook_restrict_signup_by_umass_domain` in
  `supabase/migrations/20260817210000_restrict_signup_by_umass_domain.sql` (+ a follow-up migration
  pinning `search_path` per the security advisor). Rejects any signup whose email doesn't end in
  `@umass.edu` (case-insensitive, anchored so `evil.com/notumass.edu` tricks don't pass) before the
  `auth.users` row is ever created — no race window, no orphaned non-umass rows. **Applying the
  migration only creates the function — it does not enable the hook.** Registration is dashboard-only
  (Authentication > Hooks (Beta) > select `hook_restrict_signup_by_umass_domain` from the "Before User
  Created" dropdown); confirm this is actually selected before treating the restriction as live.
  **Re-verifying this is no longer a plain signup-and-expect-403 curl** — see the three checks in
  the #268 bullet below (live settings, live dashboard read, local pgTAP) for why and what replaced
  it. Once confirmed live, profile/RLS policies don't need to re-check the email domain —
  `auth.uid()` scoping is sufficient, since the hook already guarantees no non-umass row can exist.
- **#268: email/password signup was live on the project with no ownership check — FIXED, both
  halves done.** The domain-only hook above rejected the wrong domain but not the wrong *provider*:
  the Email provider being enabled at all meant anyone could POST a password signup for
  `victim@umass.edu` and plant a discoverable, impersonating profile without ever proving they
  controlled that mailbox (`auth.users` row inserted before email confirmation, per
  `handle_new_user`'s `after insert` trigger). **Half 1 (owner-only, dashboard): DONE 2026-08-26** —
  the owner disabled the Email provider on the live project (see the Auth bullet above for the
  live-verification evidence); no MCP/API surface exposes auth provider config, so this could only
  ever be done by hand. **Half 2 (migration-tracked, done):** `hook_restrict_signup_by_umass_domain`
  (same function name, no dashboard re-selection needed) now also rejects any signup whose
  `event->'user'->'app_metadata'->>'provider'` isn't `'google'` —
  `supabase/migrations/20260826120000_restrict_signup_by_google_provider.sql`. **Not yet applied to
  the live project** — that happens only after this PR is reviewed and approved, same rule as
  `shared_stats` above; half 1 (provider off) is what's actually protecting live today, half 2 exists
  only in the repo until applied. Field choice
  (`provider`, not the sibling `providers` array) matches Supabase's own docs example for exactly
  this use case (Auth Hooks > Before User Created hook > "Block by OAuth Provider"): at
  user-creation time there's exactly one identity being created, so `providers` is always a
  one-element array holding that same value — checking it adds nothing. Note this is an
  allowlist (`provider is distinct from 'google'`), not a Discord-style denylist, so it also
  rejects `/auth/v1/invite` and anonymous sign-in the same way it rejects email/password — both are
  off live today so there's no conflict, but a future owner turning either on shouldn't be surprised
  it gets caught by this same check. `supabase/config.toml` mirrors the live posture locally
  (`[auth.email] enable_signup = false`).
  **This retires the old `@umass.edu` re-verification method above** (`POST /auth/v1/signup`,
  expect the hook's 403) — it no longer proves anything about the hook, because with the Email
  provider off, GoTrue rejects the request at the provider gate before the hook ever runs. Confirmed
  both locally and live (2026-08-26): the same curl now returns
  `400 {"error_code":"email_provider_disabled","msg":"Email signups are disabled"}` in both places.
  Re-verify with these instead:
  - **Provider stays off (live, read-only, repeatable):** `GET /auth/v1/settings` →
    `"external":{"email":false,"google":true}`. Non-mutating, no throwaway signup needed.
  - **Hook is still wired (live, read-only):** Authentication > Hooks (Beta) > Before User Created
    still shows `hook_restrict_signup_by_umass_domain` selected — this is defense-in-depth for if
    the Email provider is ever re-enabled, so it's worth checking independently of the setting above.
  - **Hook logic is still correct (local, repeatable, the actual regression test):** call
    `hook_restrict_signup_by_umass_domain` directly with a simulated event payload (pgTAP or SQL
    Editor) — the local stack never had this hook registered to begin with
    (`supabase/config.toml`'s `[auth.hook.before_user_created]` block exists but is commented out —
    a deliberate scope decision, not a CLI limitation), so a local HTTP signup was never a way to
    reach it, provider-gate question aside. See
    `supabase/tests/database/13_restrict_signup_by_google_provider.sql` for the simulated event
    shape and the cases it covers (email+umass → rejected, google+umass → allowed, google+non-umass
    → still rejected by the domain check), including a migration-removed red run proving cases 1 and
    5 (the actual exploit) fail against pre-fix main.
- **Friends/pings/favorited-food-alerts schema: DONE and verified.** `profiles` (auto-created via an
  `after insert on auth.users` trigger — not a security boundary, just row creation),
  `friendships` (canonically ordered `user_a < user_b`, always insert via the `request_friendship(uuid)`
  RPC rather than a raw insert), `pings` (insert requires an `accepted` friendship, enforced in the RLS
  policy, not trusted to the client), `favorited_foods`, `push_tokens`, `food_sightings`. Verified
  end-to-end with real signed-up test users + simulated JWT claims (`set local request.jwt.claims`):
  trigger fires, `request_friendship` orders correctly, a third party can't read others' friendships,
  friends can ping each other, non-friends are rejected by RLS. All test rows cleaned up afterward.
  That manual verification is now also automated — `supabase/tests/database/` (pgTAP, runs in CI
  against a local stack, never the live project) covers the same ground repeatably. Building it
  surfaced a real, previously-invisible risk: none of these tables had an explicit `GRANT` — they
  only worked via Supabase's "legacy auto-expose" default, which grants base table privileges to
  `authenticated`/`service_role` automatically but is being **removed entirely on 2026-10-30**
  (confirmed via `supabase/config.toml`'s own `auto_expose_new_tables` comment). Without an explicit
  grant, RLS never even gets evaluated — Postgres denies at the table-privilege level first. Fixed
  via `20260818130000_grant_authenticated_table_access.sql`, scoped to exactly what each table's
  existing RLS policies already allow (does not widen access, RLS still fully gates every row) —
  applied to the live project 2026-08-18, confirmed via `information_schema.role_table_grants` that
  the grants already existed there too (same legacy default, just not migration-tracked before now),
  so this was a preemptive fix, not a live-breakage repair — but would have become one in October
  without it.
- **`check-favorited-foods` Edge Function: matching logic verified, push dispatch implemented and scheduled (see full status further down this bullet).**
  Fetches live `foodpro-menu-ajax` data for all 4 halls, matches against `favorited_foods` for users
  with `notifications_enabled`, upserts `food_sightings`. The dish-name-extraction regex was
  independently verified against live data (93 real dishes at Hampshire, including known items).
  A real bug was caught and fixed here: the first deploy used `profiles!inner(...)` as an embedded
  PostgREST join, which fails because `favorited_foods` and `profiles` both reference `auth.users`
  independently with no direct FK between them — PostgREST can't infer that join path. Fixed with two
  plain queries instead. Re-invoked after the fix: runs cleanly (`checkedHalls: 4`), correct empty-state
  output. **The actual positive-match path (a real favorite → a real `food_sightings` row) is
  unverified** — blocked by Supabase's free-tier email-send rate limit preventing a second test-user
  signup, and there's no service-role/Admin API access available to route around it. **Push
  credentials: DONE (2026-08-18).** VAPID keypair (Web Push, `/web`) and an Expo access token +
  Firebase/FCM project (Android push, `/mobile`) are configured — Supabase Edge Function secrets
  `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `EXPO_ACCESS_TOKEN` all set; `mobile/`
  has an EAS project link (`eas.json`, `app.json`'s `extra.eas.projectId`), `google-services.json`,
  and the Android package renamed to `com.udinetogether.udine` (Firebase Android app registration
  needs a real, lowercase package name). **Unconfirmed**: whether the FCM V1 service-account key
  was actually uploaded to EAS via `eas credentials` — that step needs a real TTY (couldn't be
  driven non-interactively) and its completion was never independently verified; run
  `npx eas-cli credentials` from `mobile/` and check Push Notifications shows a configured service
  account before treating Android push delivery as reliable. Web Push subscription registration
  (`/web`) and Expo push-token registration (`/mobile`) are both implemented, writing to
  `push_tokens`. **Push dispatch: implemented and deployed (2026-08-18, function v7).** Sends Web
  Push (via `npm:web-push`) and Expo push per new `food_sightings` row, deletes permanently-dead
  tokens, gates each platform on its own secrets independently. Deployed live and invoked directly
  (`curl` against the function URL) to confirm it actually boots and runs on the real Supabase Edge
  Runtime — this mattered because `npm:web-push` was only ever tested locally before deploying, and
  a broken import there would have crashed the whole function, including the previously-working
  matching logic. **Result: `npm:web-push` imports and runs fine on the real Edge Runtime** — the
  first live invocation 500'd, but from a much smaller, unrelated bug: the `VAPID_SUBJECT` secret
  was set to a bare email (`udine.dlbo0@aleeas.com`) instead of a `mailto:` URI, which `web-push`'s
  `setVapidDetails` requires. Fixed by resetting the secret to `mailto:udine.dlbo0@aleeas.com`; a
  follow-up invocation returned `200 {"checkedHalls":4,...,"pushConfigured":true,"pushSent":0,...}`
  cleanly. **Still unverified**: an actual push landing on a real device/browser — no registered
  token exists yet to send to, and Android delivery additionally depends on the still-unconfirmed
  FCM V1 upload noted above. **`pg_cron` scheduling: DONE (2026-08-18).** ADR 0002's deferral
  condition (push dispatch verified working) was met, so the job was wired up and applied to the
  live project — `pg_cron`/`pg_net` extensions enabled, `cron.job` shows
  `check-favorited-foods-hourly` active on schedule `0 11-23,0-1 * * *` (hourly, ~7am–9pm Eastern,
  hand-converted to UTC — does not auto-adjust for DST, see the migration's own comment for the
  twice-a-year fix). Auth uses the anon/publishable key from Supabase Vault (`check_favorited_foods_
  auth_token`), not the service-role key — least-privilege, since the function ignores the incoming
  request and does its own DB access with its own service-role secret. Verified end-to-end, not
  just applied: manually triggered the same `net.http_post` call the cron job runs and confirmed
  via `net._http_response` that it actually got back a live `200` with the function's normal JSON
  body, not just that `net.http_post` returned a request id (which it does unconditionally,
  regardless of the HTTP outcome — see the migration's own comment on this pitfall).
- **`shared_stats` schema + RLS (#94): DONE, local pgTAP green.** One row per user
  (`supabase/migrations/20260820120000_shared_stats.sql`), three independently-nullable jsonb
  columns (`completion`, `top_foods`, `hall_ranks`) instead of three tables, so "opted in or not" is
  presence/absence of one column, enforced down to a check constraint — only a real absent/SQL-NULL
  column counts as "not shared". **#271 tightened this check (not yet applied to the live
  project — same "after PR review" rule as the rest of this bullet):** the original constraints
  only rejected the JSON `null` literal, so an accepted friend could upsert any other non-array
  jsonb shape (a string/object/number, or an array with a malformed element) via a raw PostgREST
  call and crash the friend-profile screen's rendering. `supabase/migrations/
  20260826130000_shared_stats_jsonb_array_constraint.sql` replaced
  `shared_stats_{completion,top_foods,hall_ranks}_not_json_null` with
  `shared_stats_{completion,top_foods,hall_ranks}_is_array`
  (`check (col is null or jsonb_typeof(col) = 'array')`) — SQL NULL and a JSON array are the only
  two shapes accepted now; a JSON null literal is still rejected (an array is never `null`), so
  "privacy by presence" is unchanged. The constraint can't reach into array *elements*, so
  `mobile/src/app/friend/[id].tsx` also filters each array entry to the exact shape it renders
  (`isValidCompletion`/`isValidTopFood`/`isValidHallRank`), and `mobile/src/app/_layout.tsx` now
  exports an `ErrorBoundary` (expo-router's root-boundary pattern — there was none anywhere in the
  app before) as a second line of defense for whatever shape bug turns up next. RLS: owner full
  CRUD on their own row; a second, read-only SELECT policy admits an accepted friend only (mirrors
  pings' friendship check). `supabase/tests/database/07_shared_stats_rls.sql` (31 pgTAP assertions)
  proves:
  no row at all exposes nothing; an owner can write; an un-opted-in field stays absent even to a
  friend who can read the row; an opted-in field is visible to an accepted friend; a stranger, a
  pending-not-yet-accepted connection, and an anonymous session all see nothing (anon is a hard
  permission-denied — there's no `anon` grant on this table, same as every other social table here);
  a friend can read but never write (RLS silently filters their UPDATE/DELETE to zero rows, doesn't
  throw — same shape as `favorite_dining_halls`'s existing "alice can't update bob's row" case);
  revoking a field (`update ... set completion = null`) actually deletes it, immediately, for both
  the owner's own read and a friend's. Verified with a genuine mutation-red too, not just a
  missing-table one: loosening the friend-select policy to `using (true)` flipped the
  stranger/pending-friend denial assertions red; reverting it turned them green again. Explicit
  `select/insert/update/delete` grants to `authenticated`/`service_role` per the 2026-10-30
  auto-expose deprecation (see the grant migration above). **Not yet applied to the live project** —
  per #94's own instruction, that happens only after this PR is reviewed and approved, not
  automatically once local pgTAP is green. Mobile: `mobile/src/lib/privacySettings.ts` derives each
  stat's synced payload (a truncated cut — no `pct`/`tone`/comparison counts, see its own doc
  comment) and decides what a toggle should push; `shared/src/sync.ts`'s `syncSharedStat` does the
  actual upsert-or-null-out. Both jest- and node:test-covered, red-first (mutation-tested, not just
  written-then-run-once).

## Data sources

| Source | What it gives us | Notes |
|---|---|---|
| `umassdining.com/foodpro-menu-ajax?tid=<term_id>&date=MM%2FDD%2FYYYY` | Menu items + full nutrition panel per dining hall/date/meal | **Confirmed live** (see RE doc) — `tid` is a Drupal taxonomy term id, not a FoodPro location number: Worcester=1, Franklin=2, Hampshire=3, Berkshire=4. Response is meal-period → category → HTML fragment; parse the `data-*` attributes on each `<a data-dish-name=...>`, don't treat it as structured JSON. |
| `umassdining.com/uapp/get_beacons_events` | Dining hall events | |
| `umassdining.com/uapp/get_press*` | Press releases | |
| `umassdining.com/uapp/get_notice`, `get_updates` | Notices | Lower priority |
| OpenFoodFacts API | Barcode lookup, packaged-food macros | For foods not on the UMass menu (off-campus, brought-from-home) |

UMass Dining's own nutrition numbers are the source of truth for on-campus items; OpenFoodFacts fills
the gap for everything else. Do not scrape `mobileapp.umassdining.com/umassapi2` account endpoints —
that's UMass Dining's own user system (employee-token auth), unrelated to our Supabase accounts.

## Feature parity with the official app (baseline, not the ceiling)

The official app already has: dish/location favorites (binary, not ranked), allergen/diet filters,
push (OneSignal) + local notifications, BLE-beacon dining-hall check-ins tied to events, press
releases, FAQ, staff directory, newsletter. UDine must cover most of this and add:

- Calorie/macro tracking (the official app has none — `nutrition`/`calories_from_fat` strings exist
  only as display fields, no logging).
- Beli-style pairwise/ranked comparison of dishes (official app has binary favorite only, confirmed
  no ranking/rating feature in the bundle) — ranking output also derives a user's "favorite dining
  halls."
- Favorited-food-spotted-elsewhere notifications.
- Friends + "come eat with me" pings.
- Data export.
- No-account-required core usage.

BLE beacon check-ins are one official feature we're explicitly **not** porting for v1 — it needs
physical beacon hardware/IDs we don't have and isn't in the user's feature list. Note it, skip it,
revisit only if asked.

FAQ and staff directory (issue #50, product decision 2026-08-19) are explicitly **cut, not
deferred** — official-app parity items, but UDine is a macro-tracking/social app connected to the
UMass menu, and these content screens don't serve that; they were removed entirely from web,
mobile, and shared (fetchers, types, nav links, tests). Newsletter, press, and events stay — they
were not part of this cut.

## Data residency — read this before adding any table or any client→Supabase call

Health data (what/how much a user ate, calorie and macro history) **never leaves the device unless
the user explicitly exports it, or opts a truncated summary in per the Shared stats row below.**
This constrains every feature that touches food-logging:

| Feature | Lives | Why |
|---|---|---|
| Consumption log (what/when eaten, portions) | **Device only** (SQLite on mobile / IndexedDB on web) | Core privacy requirement — this is the data the user asked to never leave the device |
| Calorie/macro history, daily totals | **Device only**, derived from the log above | Same |
| Menu cache (dining hall items, nutrition facts) | **Device only**, fetched directly from UMass Dining APIs | Public data, but keeping it off Supabase keeps the anonymous path truly account-free — no DB, no RLS surface, for the core no-account flow |
| Dish/location ranking (pairwise comparisons AND computed per-dish order) | **Device only**, always | A per-dish rank order is reconstructible into "what/how much they ate" — same sensitivity as the log itself, so it doesn't get a server exception. The *raw* comparisons and the *full* per-dish order never leave the device under any setting — only the truncated, opt-in summaries in the row below can |
| Favorite **dining halls** (a handful of location IDs, derived on-device from ranking) | Server, if the user is signed in | This is the only ranking-derived thing the server sees — coarse enough (which building, not which dish) to support "come eat with me" pings without exposing food history; user must opt in by signing in |
| **Shared stats** (#94 — hall completion counts, top-5 foods by name+score+hall, full hall rank order) | Server, **opt-in per stat, default ON for accounts created on/after 2026-08-26** (see #248), and only ever visible to accepted friends | **2026-08-26 (#248 Part C) supersedes epic #87's 2026-08-19 "default all off" decision** — the owner confirmed reversing it: the three per-stat toggles (Hall completion, Top foods, Favorite halls) now start ON, not off. Existing-user story: this is a **new-accounts-only** default, not a backfill — an account created before 2026-08-26 keeps whatever it already has (nothing, for every account that predates this). "Default ON" has no column default to point at (`shared_stats` has no default row — it's still created lazily, same as before #248): **concretely, it means the first time a signed-in, never-seeded, new account opens the Your Data screen**, the client pushes all three fields and shows them ON (`privacy.tsx`'s `refresh()`, `shouldSeedSharedStatsDefault` in `mobile/src/lib/privacySettings.ts`) — not at sign-up, and not anywhere else in the app. The seed is marked done, and the one-time disclosure below fires, as soon as ANY field pushes successfully, not only on a clean sweep of all three — a field that fails after another already succeeded is not retried (accepted ceiling: a partial seed leaves the failed field off permanently rather than leaving the marker unwritten and the succeeded field undisclosed). Each of the three stats is still an independent toggle — opting into "top foods" doesn't share completion or hall ranking, and turning a stat back off still **deletes** that field server-side immediately, not just pauses future updates. A stat that's off (never opted in, or opted out) is still NULL/absent server-side, never a written `false` — "privacy by presence" is unchanged, only the starting position flipped. A one-time, dismissible note on the Your Data screen tells a newly-seeded account that these three stats share by default and how to turn each off (`mobile/src/app/privacy.tsx`, gated on the same per-user "was this account actually seeded" marker as the seed itself, `mobile/src/lib/sharedStatsSeed.ts`) — an account that was never auto-seeded (existing accounts, or one that opted in manually before 2026-08-26) never sees it, since nothing was defaulted on for it without asking. Never includes raw comparisons, comparison counts, timestamps, or the consumption log itself — see `shared_stats` migration and `mobile/src/lib/privacySettings.ts` for exactly what's cut from each payload before it's allowed to sync |
| Favorited foods (for "spotted elsewhere" alerts) | Server, only if signed in and notifications enabled — **that gate now defaults ON for new rows since 2026-08-26 (#248 Part B)**, not a user opt-in | Requires server-side matching against the menu feed to push a notification; anonymous users can still favorite locally but get no alerts. `profiles.notifications_enabled` defaults `true` for accounts created on/after 2026-08-26 (existing rows unaffected — a column default, not a backfill); a device only actually registers a push token and syncs its favorites once the user grants OS notification permission (requested only on an explicit tap of the alerts toggle, never on passive navigation) — until then the toggle renders a needs-action prompt rather than claiming it's ON with nothing behind it |
| Friends, pings, profile | Server (requires account by definition) | |
| Auth identity (email, Google sub) | Server (Supabase Auth) | |

Anonymous-first: menus, nutrition lookup, events, press releases, dietary filters, and local
logging/ranking must all work with **zero account**. Signing in only gates: friends, pings,
cross-device sync, favorited-food push alerts, and server-stored favorite dining halls. If a feature can be
built to work locally-only, prefer that over requiring an account — check this before adding an
`auth.uid()` check to a query.

Data export: every device-local table needs a JSON/CSV export path in both apps (shared logic in
`@udine/shared`). This is not optional/later — it's the release valve for "data never leaves the
device" being true without also being a trap.

## CI is local-only — do not wait on remote checks

Remote GitHub Actions runs are **disabled** (2026-08-19, owner request — hosted-runner usage): the
workflow is `workflow_dispatch`-only and branch protection no longer requires status checks. The
gate moved local, it did not go away: before merging any PR, run every lane from the comment at the
top of `.github/workflows/ci.yml` on the PR head — directly on the host (fastest), or with CI parity
via `gh act -j <job>` (config in `.actrc`, Docker required; validated working). `supabase-rls-tests`
runs host-direct (`supabase start … && supabase test db`), not under act. Don't `gh pr checks --watch`
or block on remote CI — nothing will report.

## Build order

Ship one vertical slice — browse menu → log a food item → see today's macros — working end-to-end in
**both** apps before touching friends, events, rankings, or notifications. Get the shared package's
menu-fetch + macro-math + local-storage layer right first; everything else is UI on top of it.

1. `@udine/shared`: types for dining hall/menu item/log entry, UMass Dining API client, OpenFoodFacts
   client, macro math, local-storage interface (implemented per-platform).
2. Web + mobile: menu browse → log → daily macro view. No auth required.
3. Dietary/allergen filters, favorites (binary), press/events content screens.
4. Auth (anonymous → Google OAuth sign-in), ranking system (pairwise comparisons → computed order),
   data export.
5. Friends, pings, favorited-food-elsewhere push notifications.

## Non-goals for v1

- BLE beacon check-ins (see above).
- Porting UMass Dining's own account system (`umassapi2`) — we have our own via Supabase.
- SMS-based verification — Google OAuth replaces it.
- Digital signage integration (`portal.touchwork.com`) — irrelevant outside dining hall TVs.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Emulator pool

Three shared Android AVDs (320dp/360dp/600dp) for parallel mobile UI verification, with lock
paths and boot/capacity notes. See `docs/agents/emulator-pool.md`.
