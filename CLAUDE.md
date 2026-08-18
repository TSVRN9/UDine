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
  Created" dropdown); confirm this is actually selected before treating the restriction as live — a
  real signup attempt with a non-umass email should get rejected with "UDine accounts require a
  @umass.edu email address.", not silently succeed. Once confirmed live, profile/RLS policies don't
  need to re-check the email domain — `auth.uid()` scoping is sufficient, since the hook already
  guarantees no non-umass row can exist.
- **Friends/pings/favorited-food-alerts schema: DONE and verified.** `profiles` (auto-created via an
  `after insert on auth.users` trigger — not a security boundary, just row creation),
  `friendships` (canonically ordered `user_a < user_b`, always insert via the `request_friendship(uuid)`
  RPC rather than a raw insert), `pings` (insert requires an `accepted` friendship, enforced in the RLS
  policy, not trusted to the client), `favorited_foods`, `push_tokens`, `food_sightings`. Verified
  end-to-end with real signed-up test users + simulated JWT claims (`set local request.jwt.claims`):
  trigger fires, `request_friendship` orders correctly, a third party can't read others' friendships,
  friends can ping each other, non-friends are rejected by RLS. All test rows cleaned up afterward.
- **`check-favorited-foods` Edge Function: matching logic verified, push delivery NOT implemented.**
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
  `push_tokens`. Push *dispatch* — actually sending a notification per new `food_sightings` row —
  see `docs/agents/` issue tracker, tickets #9 (dispatch implementation) and #10 (pg_cron scheduling,
  deliberately deferred until #9 lands — see `docs/adr/0002-defer-check-favorited-foods-cron.md`)
  for current status; update this paragraph once #9 merges rather than trusting it silently.

## Data sources

| Source | What it gives us | Notes |
|---|---|---|
| `umassdining.com/foodpro-menu-ajax?tid=<term_id>&date=MM%2FDD%2FYYYY` | Menu items + full nutrition panel per dining hall/date/meal | **Confirmed live** (see RE doc) — `tid` is a Drupal taxonomy term id, not a FoodPro location number: Worcester=1, Franklin=2, Hampshire=3, Berkshire=4. Response is meal-period → category → HTML fragment; parse the `data-*` attributes on each `<a data-dish-name=...>`, don't treat it as structured JSON. |
| `umassdining.com/uapp/get_beacons_events` | Dining hall events | |
| `umassdining.com/uapp/get_press*` | Press releases | |
| `umassdining.com/uapp/get_notice`, `get_updates`, `get_new_faq*` | Notices/FAQ | Lower priority |
| OpenFoodFacts API | Barcode lookup, packaged-food macros | For foods not on the UMass menu (off-campus, brought-from-home) |

UMass Dining's own nutrition numbers are the source of truth for on-campus items; OpenFoodFacts fills
the gap for everything else. Do not scrape `mobileapp.umassdining.com/umassapi2` account endpoints —
that's UMass Dining's own user system (employee-token auth), unrelated to our Supabase accounts.

## Feature parity with the official app (baseline, not the ceiling)

The official app already has: dish/location favorites (binary, not ranked), allergen/diet filters,
push (OneSignal) + local notifications, BLE-beacon dining-hall check-ins tied to events, press
releases, FAQ, staff directory, newsletter. UDine must cover all of this and add:

- Calorie/macro tracking (the official app has none — `nutrition`/`calories_from_fat` strings exist
  only as display fields, no logging).
- Beli-style pairwise/ranked comparison of dishes (official app has binary favorite only, confirmed
  no ranking/rating feature in the bundle) — ranking output also derives a user's "favorite dining
  halls."
- Favorited-food-spotted-elsewhere notifications.
- Friends + "come eat with me" pings.
- Data export.
- No-account-required core usage.

BLE beacon check-ins are the one official feature we're explicitly **not** porting for v1 — it needs
physical beacon hardware/IDs we don't have and isn't in the user's feature list. Note it, skip it,
revisit only if asked.

## Data residency — read this before adding any table or any client→Supabase call

Health data (what/how much a user ate, calorie and macro history) **never leaves the device unless
the user explicitly exports it.** This constrains every feature that touches food-logging:

| Feature | Lives | Why |
|---|---|---|
| Consumption log (what/when eaten, portions) | **Device only** (SQLite on mobile / IndexedDB on web) | Core privacy requirement — this is the data the user asked to never leave the device |
| Calorie/macro history, daily totals | **Device only**, derived from the log above | Same |
| Menu cache (dining hall items, nutrition facts) | **Device only**, fetched directly from UMass Dining APIs | Public data, but keeping it off Supabase keeps the anonymous path truly account-free — no DB, no RLS surface, for the core no-account flow |
| Dish/location ranking (pairwise comparisons AND computed per-dish order) | **Device only**, always | A per-dish rank order is reconstructible into "what/how much they ate" — same sensitivity as the log itself, so it doesn't get a server exception |
| Favorite **dining halls** (a handful of location IDs, derived on-device from ranking) | Server, if the user is signed in | This is the only ranking-derived thing the server sees — coarse enough (which building, not which dish) to support "come eat with me" pings without exposing food history; user must opt in by signing in |
| Favorited foods (for "spotted elsewhere" alerts) | Server, only if signed in and notifications enabled | Requires server-side matching against the menu feed to push a notification; anonymous users can still favorite locally but get no alerts |
| Friends, pings, profile | Server (requires account by definition) | |
| Auth identity (email, Google sub) | Server (Supabase Auth) | |

Anonymous-first: menus, nutrition lookup, events, press releases, FAQ, dietary filters, and local
logging/ranking must all work with **zero account**. Signing in only gates: friends, pings,
cross-device sync, favorited-food push alerts, and server-stored favorite dining halls. If a feature can be
built to work locally-only, prefer that over requiring an account — check this before adding an
`auth.uid()` check to a query.

Data export: every device-local table needs a JSON/CSV export path in both apps (shared logic in
`@udine/shared`). This is not optional/later — it's the release valve for "data never leaves the
device" being true without also being a trap.

## Build order

Ship one vertical slice — browse menu → log a food item → see today's macros — working end-to-end in
**both** apps before touching friends, events, rankings, or notifications. Get the shared package's
menu-fetch + macro-math + local-storage layer right first; everything else is UI on top of it.

1. `@udine/shared`: types for dining hall/menu item/log entry, UMass Dining API client, OpenFoodFacts
   client, macro math, local-storage interface (implemented per-platform).
2. Web + mobile: menu browse → log → daily macro view. No auth required.
3. Dietary/allergen filters, favorites (binary), press/events/FAQ content screens.
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
