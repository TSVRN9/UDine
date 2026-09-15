# Eager caching + signed-out favorited-food notifications

Goal: menu data for halls and Grab N Go is warm on-device well before the user opens the app in a
dead zone (dining halls have notoriously bad service), via true OS background fetch instead of
only refreshing at cold launch. The same background run also lets a **signed-out** user get a
local notification when a favorited dish shows up — today favorited-food alerts are entirely
signed-in-only, because the existing pipeline (`check-favorited-foods`) can only match against a
server-side copy of your favorites, and a signed-out user's favorites never leave the device at
all (by design, per CLAUDE.md's anonymous-first principle).

## Spec

UI: none — no rendered screen in this brief. (A separate design pass — canvas artboards — covers
the in-app "favorited food spotted" hall indicator; not part of this brief.)
Annotations: none
States: none (no UI)
Routes: none (no screenshot — nothing renders)

Backend: none. Every table this feature could plausibly touch (`favorited_foods`,
`food_sightings`, `push_tokens`) stays exactly as-is — this whole brief is mobile-client-only.
Residency: no new row. The on-device menu cache is already "Device only, fetched straight from
UMass Dining" (CLAUDE.md) — this brief only changes *when* that fetch runs (periodic background
task instead of only app-launch), not what data it is or where it lives. The new signed-out
notification-matching path is the same shape: it reads the device's already-local favorited-dish
list (`FavoritesStorage`, already device-only for a signed-out user) against the already-local
menu cache, and writes only a new device-local dedup record (which dish/hall/date already fired a
local notification) — nothing server-bound, nothing new to add to the residency table.
Rationale: **one shared background task, not two.** `expo-background-task` is best-effort and OS-
throttled (Android: ~15 min minimum via WorkManager; iOS: BGTaskScheduler, no guaranteed timing —
confirmed against the current Expo docs for this project's SDK, 57). Registering two separate
tasks risks losing determinism (Expo's own docs: "multiple tasks share a single worker; last
registered task sets minimum interval") for no benefit, since both jobs need the same freshly-
fetched menu data anyway. **Local notification matching only runs when signed out.** A signed-in
user already gets reliable push via `check-favorited-foods` (delivered via APNs/FCM, independent
of whether this background task ever runs at all); re-running the same match client-side for them
too would risk a double notification for the same sighting with no coordinated dedup between the
two independent systems. The alternative considered — running the local check for every user,
signed in or out — was rejected for exactly that double-notify risk, and because it duplicates a
job the server already does more reliably for signed-in users. **Scope stays exactly halls + Grab
N Go** (`DINING_HALLS`/`GRAB_N_GO_TIDS` from `@udine/shared`, the exact same scope
`prefetchTodaysMenus` already covers) — not retail/café locations, which the owner deliberately
scoped out: little dish-name overlap between retail and hall menus, and retail menus themselves
change rarely enough that a "spotted today" alert would mostly be daily noise, not news.

## Acceptance

- [ ] A background task registers via `expo-background-task` and, on each run, refreshes the
      on-device menu cache for every `DINING_HALLS` tid + every `GRAB_N_GO_TIDS` tid (the same
      scope `prefetchTodaysMenus` already covers, exactly — no retail/café tids) — evidence: test
- [ ] `prefetchTodaysMenus`'s existing app-launch call is preserved (cold start still warms the
      cache immediately, doesn't wait for the first background-task run) — evidence: test
- [ ] A new shared matching primitive (`@udine/shared`) takes a favorited-dish list + fetched menu
      items and returns exact matches only — trimmed, HTML-entity-decoded, case-sensitive, no
      fuzzy/substring matching — mirroring `check-favorited-foods`' `extractDishMealMap`/match-by-
      exact-key semantics exactly (`supabase/functions/check-favorited-foods/index.ts`) —
      evidence: test
- [ ] When signed out, a match not already in the local dedup store fires exactly one local
      notification (`Notifications.scheduleNotificationAsync`, no server/token round-trip) and
      records the dedup entry — evidence: test
- [ ] The same (dish, hall, date) match does not fire a second local notification on a later
      background-task run — evidence: test
- [ ] When signed in, the background task still refreshes the cache but never calls the local-
      notification match path — evidence: test
- [ ] A failed or slow fetch for one hall/tid during a background run degrades silently (matches
      `prefetchTodaysMenus`'s existing per-tid `.catch(() => {})` swallow) and never throws out of
      the registered task — evidence: test
- [ ] iOS background-task execution is documented as unverifiable in this repo's emulator pool
      (Background Tasks API is unavailable on the iOS simulator per Expo's own docs — physical
      device only) — evidence: none, a documented limitation in the PR body, not a test gap to
      chase

## Tasks

1. Shared favorited-dish matching primitive — files: `shared/src/favoriteMatch.ts` (new, exact-
   match function per the Rationale above), `shared/src/index.ts` (barrel export) — lanes:
   `pnpm --filter @udine/shared test && pnpm --filter @udine/shared typecheck && pnpm --filter
   @udine/shared lint` — blocked by: none — PR:
2. Background task registration + cache-warm scope — files: `mobile/src/lib/backgroundTask.ts`
   (new: `expo-background-task` + `TaskManager.defineTask` registration, calls the same
   fetch/cache-save logic `menuPrefetch.ts` already uses), `mobile/src/app/_layout.tsx` (register
   the task alongside the existing `prefetchTodaysMenus()`/`registerNotificationHandler()` calls),
   `mobile/package.json` (add `expo-background-task`, `expo-task-manager`), `mobile/app.json` (CNG
   config for the new native capability — this needs a native rebuild, not just a JS change; call
   this out loudly in the PR, `npx expo run:android` per CLAUDE.md's Commands section, and note
   iOS's Info.plist requirements even though iOS can't be verified in this repo's emulator pool) —
   lanes: `cd mobile && npx tsc --noEmit && TZ=America/New_York npx jest && pnpm --filter mobile
   lint` — blocked by: none — PR:
3. Signed-out local notification matching — files: `mobile/src/lib/backgroundTask.ts` (extend:
   call task 1's matching primitive against the freshly-fetched menu + `FavoritesStorage`, only
   when signed out), a new local dedup store (device-local, e.g. SQLite table or AsyncStorage
   keyed by dish+hall+date, mirroring `food_sightings`' `unique(user_id, dish_name, hall_tid,
   sighted_date)` shape but per-device not per-user) — lanes: same mobile lane as task 2 — blocked
   by: 1, 2 — PR:
