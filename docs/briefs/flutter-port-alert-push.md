# Flutter port: favourite alerts by push

Goal: a user who has turned on "Notify me" gets the alert for a favourited dish whether or not UDine has run
that day: killed, in Doze, never opened since boot. The server posts one visible notification per dish per
day to that dish's FCM topic. Each install follows only the topics of the dishes it favourited, so our server
never learns who favourited what and no account is needed.

Roadmap and global decisions: `docs/briefs/flutter-port.md`. Extends `docs/briefs/flutter-port-favorite-alerts.md`
(PRs #596 and #605, **both unmerged as of this brief; every Flutter task here is blocked by them landing**).
Owner decisions of 2026-10-17 are fixed and not reopened here.

## Spec

UI: M2 R11 §2 (`CONCEPT.md` "Round 11", section 2) for the notification text and the Notify me row, which
are unchanged. The tap landing and the favourites cue (hall-card stars and the app icon badge) belong to M2
round 13, which is being designed; this brief points at it and designs nothing.
- **The notification:** title is the dish's name, body is the dish sheet's "where" sentence, built on the
  server ("Lunch from 11 AM at Worcester"; "Lunch now, until 4:30 PM, at Worcester and Berkshire"). Several
  groups are joined with a newline, as `dueAlerts` does (`app/lib/alerts/alert_check.dart:33`, `dueAlerts` at `:24`, on
  `origin/flutter/favorite-alerts-ui`).
- **Posting rules** (M2 R11 §2, unchanged): not before 7 AM Eastern; the first run that sees the dish on that
  day's menus; never once the dish's last serving that day has ended; one per dish per day across halls;
  the day rolls over at 2 AM (`defaultRolloverHour`, `app/lib/core/date.dart:4`).
- **The tap opens the dish's sheet over Halls home** (owner, 2026-10-21; this replaces the 2026-10-17 landing on
  Halls home with sheets closed, and #605's hall-at-the-dish landing). Every other sheet closes first except an
  undismissed first run. The dish is the notification's title; `data.route` is not read, so old and new payloads
  both work, and a title that is empty or a route (the retired check's payload) lands on Halls home alone. A dish
  not served today still opens its sheet, whose where line says so.
- **The Notify me row** keeps its permission states (off, allowed, denied, revoked). The battery-restricted
  row ("Battery use is restricted, so UDine can't check menus" + Open Settings) is retired on both platforms
  (owner, 2026-10-21): on the A53 with battery Restricted (`appops RUN_ANY_IN_BACKGROUND ignore`) FCM pushes
  still arrived, so the warning was false. iOS's Background App Refresh row went with Task 6.
- **Subscription follows three facts:** Notify me is on, OS permission is granted, the dish is favourited.
  Any one false means unsubscribed.

Annotations: none.
States: Notify me off, allowed, denied (restricted is retired); a
received notification with the app killed; the tap opening the dish sheet over Halls home from killed, backgrounded,
foreground-with-a-sheet-open.
Routes: `/halls` is the landing. Notification payload `data.route = "/halls"`. The device runs are in
"Device verification".

Backend: new table `public.dish_alerts_sent`, new edge function `send-dish-alerts`, a pg_cron job. Nothing
per-user. `push_tokens`, `favorited_foods` and `check-favorited-foods` (the RN path) are untouched.
Residency: **a new row in CLAUDE.md's table** (Task 8): "Favorite-dish alerts (Flutter) | Device: Notify me and
favourites. Google/FCM: the install's topic follows, `dish-<hash>` per favourited dish. Our server: nothing
about who follows what." The hash of a public dish name is reversible by anyone with the public menu, so the
privacy policy says in plain words that Google can tell which dishes an install follows. Anonymous-first
holds: no sign-in, no `auth.uid()` check.
Rationale:
- **Topics over per-device sends.** A per-device send needs the server to hold a token and a favourites
  list, which is exactly the table the residency rule forbids for Flutter. Topics move that knowledge to FCM
  and leave ours empty. Rejected: the RN path (`push_tokens` + `favorited_foods`, `check-favorited-foods`),
  which needs an account and stores favourites on the server.
- **Why local checks weren't enough.** WorkManager has a 15-minute floor and Doze/standby buckets delay or
  skip it; iOS background fetch is best-effort and doesn't run for a force-quit app (M2 R11 §2 "Limits").
  FCM high-priority notification messages are delivered in Doze.
- **Existing server pieces to reuse:**
  - Menus: `fetchHallMenu` / `fetchAllHallMenus`, `extractDishMealMap`
    (`supabase/functions/check-favorited-foods/index.ts:62,93,117`), the `foodpro-menu-ajax` feed. Hall
    hours: `mapHallHours` / `fetchHallHours` (`supabase/functions/_shared/hours.ts:72,195`, from
    `get_infov2`).
  - Cron gate: `requireCronSecret` and the `x-udine-cron-secret` header (`_shared/cronAuth.ts:37`, the header constant at `:23`), set per
    function in `supabase/config.toml:384-408` (`verify_jwt = true`), scheduled by pg_cron + pg_net with the
    secret from Vault (`supabase/migrations/20260909200000_edge_cron_shared_secret.sql:65`, the same shape as
    `20260914120000_schedule_populate_retail_dishes.sql:46`).
  - Public-facts table shape: `supabase/migrations/20261012120000_occupancy_history.sql:17-19` (RLS on, grants
    to `service_role` only).
- **What is missing server-side.** `_shared/hours.ts` is a deliberately small subset
  (`hours.ts:1-12`: no effective-window synthesis), and `check-favorited-foods` builds a different, one-line
  body (`buildSightingNotification`, `index.ts:138`). The sentence the M2 sheet says is Dart-only today:
  `wherePlan`, `whenText`, `mealWindow` in `app/lib/core/m2/where.dart` and `effectiveMealWindow` in
  `app/lib/core/hours.dart:164`.
- **DRY by vectors, not by one implementation.** The repo already runs two implementations against one JSON
  file (`shared/vectors/hours.json` drives `shared/src/hours.ts`, `supabase/functions/_shared/hours.vectors.test.ts`
  and the Dart port; `shared/vectors/favorite-match.json` likewise). Deno can't import `@udine/shared`
  (`hours.ts:3-6`). So: Dart stays the source of the sentence; Deno gets `_shared/where.ts` as a port; a new
  `shared/vectors/where.json` is run by both. No TS port in `/shared`, because no TS client needs it (RN is
  being retired). The same applies to the topic key (Task 1), which does get a `/shared/src` copy because the
  owner asked for Dart and TS and the repo's `vectors.test.ts` pattern covers it.
- **Dedup.** `public.dish_alerts_sent(dish_key text, day date, primary key (dish_key, day))`. Public facts
  only: a dish key and a logical day, no user, no token. The function claims with
  `insert … on conflict do nothing returning`, sends only if a row came back, and deletes the claim if the
  FCM call fails (the same claim/release rule as `runAlertCheck`). Rows older than three days are deleted
  at the end of a run. The first run of a day sends one message per dish on every menu (a few hundred),
  so sends go out with a small concurrency cap, and a 429 or 5xx from FCM releases the claim for the next
  run rather than retrying in a loop. RLS enabled with no policies and grants to `service_role` only, so `anon` and
  `authenticated` can't read it (CLAUDE.md: explicit GRANTs + RLS on every new table; TRUNCATE not granted).
  Any SQL function pins `search_path`.
- **Cron.** pg_cron is UTC and doesn't follow DST (the caveat at
  `20260818120000_schedule_check_favorited_foods.sql:60-72`). So the job fires at 11:00 and 12:00 UTC, and
  the function reads Eastern time itself (`Intl`, as `check-favorited-foods/index.ts:31-36` does) and sends
  only between 7:00 and 9:00 AM Eastern (owner answer 2).
- **Android message shape:** `notification: {title, body}`, `android: {priority: "HIGH", notification:
  {channel_id: "favorite_alerts", tag: "dish-<hash>-<day>"}}`, `data: {route: "/halls"}`. The channel id is
  the one #596 already creates (`alerts.dart:22` on `origin/flutter/favorite-alerts-ui`). **iOS:**
  `apns: {headers: {"apns-collapse-id": "<same tag>", "apns-priority": "10"}, payload: {aps: {sound:
  "default"}}}`. The collapse id is at most 64 bytes; `dish-` + 16 hex + `-` + a date is 32.
- **Device sync (Task 6).** `firebase_core` + `firebase_messaging`. Rules:
  - Subscribe when the three facts hold; unsubscribe when one stops holding (unfavourite, Notify me off,
    permission revoked).
  - **Full resync on launch and on resume** (the same hook that already calls `AlertsModel.refresh`,
    `app/lib/shell/shell.dart:176` on that branch): compute the wanted set, diff against the last applied
    set stored on the device, subscribe/unsubscribe the difference. The applied set is a device-local
    preference key, so a failed call retries next time. Topic subscriptions are not queryable from the
    client, which is why the app keeps its own record.
  - **Offline:** `subscribeToTopic` fails; the diff stays unapplied and the next resume retries. FCM itself
    queues nothing for a subscribe, so the app must not mark it applied until it resolves.
  - **No Google Play services** (de-Googled Android): `firebase_messaging` throws or never returns. The
    sync catches it, logs it, and the row keeps its state; the user gets no push. This is the one case the
    kept WorkManager check would cover (Open question 1).
  - **Limits:** 2000 topics per app instance, so the sync caps the wanted set at 2000 (favourites are far
    below this). Topic names match `[a-zA-Z0-9-_.~%]+`; `dish-` + hex fits.
  - **Foreground:** FCM doesn't display while the app is in the foreground. `onMessage` shows it through
    `flutter_local_notifications` with the same Android tag, so a message that is then replayed collapses.
  - **Tap:** `getInitialMessage()` (killed), `onMessageOpenedApp` (backgrounded), and the local
    notification's response (foreground) all go through the one existing path (`alertTaps` / `takeHeldTap`,
    `alerts.dart:26-35`), which now closes sheets, lands Halls home and opens the dish's sheet (the payload is the dish name).
  - A second `Firebase.initializeApp` isn't needed; the Google Services Gradle plugin reads the flavor's
    `google-services.json`.
  - **No contact with Google until Notify me is on.** FCM auto-init is off
    (`firebase_messaging_auto_init_enabled=false` in the Android manifest, `FirebaseMessagingAutoInitEnabled`
    NO in Info.plist), and the sync calls `setAutoInitEnabled(true)` only when the three facts first hold.
    Turning Notify me off unsubscribes every topic, then calls `deleteToken()`. No Analytics, Crashlytics or
    other Firebase product is added.
- **What the push replaces and what stays from #596/#605.**

  | Piece | After push |
  |---|---|
  | `dueAlerts`, `wherePlan`, `whenText` (`alert_check.dart`, `where.dart`) | Stay: the dish sheet uses `where.dart`; they become the vector source for the server |
  | `workmanager`, `alertsDispatcher`, `setAlertsScheduled`, `runAlertCheck`, `loadAlertBoard`, the `alertTask` BGTaskScheduler entry | Replaced; removed in Task 7 once Task 6 is verified on the A53 (see below) |
  | `alert_sent` table and its export | Removed with the check, in Task 7 (a `user_version` migration, export test updated) |
  | `AlertsModel`, the Notify me row, permission states, `AlertsOs` (`allowed`, `request`, `backgroundRestricted`, `openSettings`) | Stay. `schedule(on)` becomes "sync topics" |
  | `flutter_local_notifications` | Stays: channel, foreground display, permission request |
  | Tap landing at the dish (`alertLanding`) | Replaced by Halls home with the dish's sheet over it (`openAlertDish`) |

- **WorkManager: drop it once push is verified (recommended).** Keeping both has an unavoidable duplicate on
  iOS and an avoidable-only-by-luck one on Android:
  - Android: the local post and the FCM post carry the same tag, so the second replaces the first. But
    `alert_sent` can't know a push arrived while the app was dead, so the local check would post anyway
    and re-alert (sound/heads-up again) when it replaces.
  - iOS: `apns-collapse-id` only collapses remote with remote. A local notification and a remote one are two
    banners.
  - What the fallback buys: delivery on phones without Play services, and a second path if FCM misses.
    That's a small slice; the A53 run shows whether FCM misses at all. Open question 1.
  - Until Task 7 lands, both run, with the shared Android tag, on the internal flavor only.

Rejected: data-only topic messages. They would need the app to wake and post locally, which is the Doze
problem again.

## Owner-only steps (not done by an agent; no secret is committed or printed)

Project: Firebase `udine-a6996`. `mobile/google-services.json` (the RN app, committed) covers only
`com.udinetogether.udine` (`:12`).
1. **Done 2026-10-17:** `com.udinetogether.udine.internal` is registered as "UDine (internal)"
   (`1:409750876794:android:f914fabbbf6f4544e841c3`), beside the release app.
2. **Done 2026-10-17:** the project's `google-services.json` now lists both packages, so one file at
   `app/android/app/google-services.json` serves both flavors. The file is public client config, not a
   service secret (`mobile/google-services.json` is already committed). A copy is at
   `~/.cache/udine-scratch/firebase/internal-google-services.json`, or Task 6 regenerates it with
   `firebase apps:sdkconfig ANDROID 1:409750876794:android:f914fabbbf6f4544e841c3 --project udine-a6996`.
3. **Enable the Firebase Cloud Messaging API (v1)** in the Google Cloud project, then create a service
   account key: Project settings, Service accounts, Generate new private key. Save it outside the repo.
4. `supabase secrets set --project-ref ubogyqskqzvkcqboqbhw --env-file <path outside repo>` with
   `FCM_SERVICE_ACCOUNT_JSON=<the file's contents>` and `FCM_PROJECT_ID=udine-a6996`. Delete the local key
   file after. Never `echo` it or paste it in chat. The existing `EDGE_CRON_SECRET` and Vault
   `edge_cron_secret` are reused (no new cron secret).
5. **iOS (later, with the TestFlight build):** register `com.udinetogether.udine` as an iOS app in Firebase,
   put `GoogleService-Info.plist` in `app/ios/Runner/`, create an APNs auth key (.p8) in the Apple
   developer account, and upload it under Cloud Messaging, Apple app configuration, with the Key ID and
   Team ID. Enable the Push Notifications and Background Modes (remote notifications) capabilities on the
   App ID.
6. Apply the migrations (owner-merged, per CLAUDE.md "Migrations go live only after PR review"), then deploy
   `send-dish-alerts` and confirm the cron job's first run in `cron.job_run_details` and
   `net._http_response`.

## Acceptance

- [ ] The topic key is identical in Dart, TS and Deno for every vector (accented letters, curly and
  straight apostrophes, "&", case, whitespace). `dishKey` **drops** non-ASCII letters ("Jalapeño" becomes
  `jalape o`), it doesn't fold them; the vectors pin that, so no runner "fixes" it with NFD stripping and
  breaks parity with the on-device key — evidence: test (`shared/vectors/dish-topic.json`, three runners)
- [ ] The server's "where" sentence equals the Dart sentence for every vector, including "now, until",
  "from", two halls, a dish whose last serving has ended (no sentence) and the 2 AM rollover — evidence:
  test (`shared/vectors/where.json`, Dart and Deno)
- [ ] `dish_alerts_sent` is unreadable and unwritable by `anon` and `authenticated`, has no TRUNCATE
  grant, and a second claim for the same (dish, day) returns no row — evidence: pgTAP
- [ ] A run before 7 AM Eastern posts nothing; a dish on two halls posts once; a second run the same day
  posts nothing; a failed FCM call releases the claim; a dish whose last serving ended posts nothing — evidence:
  deno test (fake clock, fake menus, fake FCM)
- [ ] A request with the cron secret and `{"test": {"dish": "<name>"}}` sends that one dish's notification
  now, skipping the Eastern-time gate and the claim (it writes no `dish_alerts_sent` row); without the
  secret it is refused like any other call — evidence: deno test
- [ ] The function refuses a request without the cron secret and never logs the service-account JSON or
  the access token — evidence: deno test
- [ ] With Notify me never turned on, the app makes no FCM call and auto-init stays off; turning it off
  unsubscribes everything and deletes the token — evidence: test (fake messaging) + manifest test
- [ ] Subscribe/unsubscribe/resync follow the three facts, retry after a failed call, cap at 2000, and
  survive a thrown `firebase_messaging` — evidence: test (fake messaging)
- [ ] A push sent to a real dish topic arrives with the app force-stopped and with the device force-idled,
  and shows the dish name and the where sentence — evidence: device recording on the A53
- [ ] Tapping it lands on Halls home with the dish's sheet open over it (other sheets closed, first run
  excepted), from killed, backgrounded and foreground-with-a-sheet — evidence: widget tests (fake messaging) +
  device recording
- [x] Android battery use "Restricted" still delivers, so no battery row — evidence: A53 run 2026-10-21
- [ ] CLAUDE.md's residency table and the published privacy policy describe the topics — evidence: diff
  (+ gh-pages PR)

## Device verification (Galaxy A53 `R5CT40V5AME`, `com.udinetogether.*` only)

On the internal flavor (`com.udinetogether.udine.internal`), signed in to nothing:
1. Favourite a dish, turn on Notify me, grant permission; confirm the topic is followed (the sync's debug
   log, no secret).
2. `adb shell am force-stop com.udinetogether.udine.internal`, then call `send-dish-alerts` with
   `{"test": {"dish": "<that dish>"}}` (Task 4's test hook; the owner runs it, or an agent with the cron secret
   loaded from the owner's env file, never printed). Record the banner arriving.
3. `adb shell dumpsys deviceidle force-idle`, call it again for the same or a second dish, record arrival;
   `adb shell dumpsys deviceidle unforce` after.
4. Tap each: record the dish's sheet opening over Halls home.
5. Set battery use to Restricted, send again, record that it still arrives (done 2026-10-21: it does).
DND via adb as in memory; nothing but the `com.udinetogether.*` packages is touched.

**iOS is not verifiable here.** A TestFlight tester runs it from `docs/agents/ios-checklist.md` after step 5
of the owner-only list, once the release brief's TestFlight build exists; the same four checks.

## Tasks

1. **Topic key and normalization:** `dishTopic(name)` = `dish-` + first 16 hex of sha256 of the normalized
   name. Normalization is the app's existing `dishKey` (`app/lib/core/m2/board.dart:17`: lowercase, drop
   `’` and `'`, runs of non-`[a-z0-9]` become one space, trim) on the name as the feed gives it (no Unicode normalization). Dart
   `core/dish_topic.dart`, TS `shared/src/dishTopic.ts`, Deno `_shared/dishTopic.ts`, one vector file —
   files: `shared/vectors/dish-topic.json`, the three implementations and their tests — lanes: flutter,
   shared, deno — blocked by: none (owner-merged: touches `supabase/functions/_shared/`) — PR:
2. **The server's "where" sentence:** `_shared/where.ts` (`wherePlan`, `whenText`, `mealWindow`,
   `effectiveMealWindow` over `HallHours`, extending `_shared/hours.ts`), `shared/vectors/where.json`
   generated from the Dart implementation, a Dart test that runs it. The server always builds the sentence
   with `newton: false` (`wherePlan`, `app/lib/core/m2/where.dart:51`): topics are per dish, not per user,
   and the Charles River places aren't in the `tid` feeds the server reads. The vectors pin
   `newton: false` — files: `supabase/functions/_shared/`,
   `shared/vectors/`, `app/test/core/` — lanes: flutter, deno — blocked by: none (owner-merged: touches
   `supabase/`) — PR:
3. **Dedup table:** migration for `dish_alerts_sent` with RLS, grants and the three-day sweep — files:
   `supabase/migrations/`, `supabase/tests/database/27_dish_alerts_sent.sql` — lanes: pgTAP (host-direct) —
   blocked by: none (owner-merged) — PR:
4. **`send-dish-alerts` edge function:** menus + hours fetch, match to per-dish topics, claim, FCM HTTP v1
   send with an OAuth token minted from the service account, release on failure, Eastern-time gate, and the
   test hook `{"test": {"dish": "<name>"}}` (behind `requireCronSecret`; skips the gate and the claim, and
   sends through the same FCM path as a real run, so the device run checks the real message shape);
   `[functions.send-dish-alerts] verify_jwt = true` in `supabase/config.toml`, `requireCronSecret` — files:
   `supabase/functions/send-dish-alerts/`, `supabase/functions/_shared/fcm.ts`, `supabase/config.toml` —
   lanes: deno — blocked by: 1, 2, 3 (owner-merged) — PR:
5. **Schedule:** pg_cron + pg_net job calling it with the `x-udine-cron-secret` from Vault; inert until the
   owner-only secrets exist — files: `supabase/migrations/` — lanes: pgTAP (job row present) — blocked by: 4
   (owner-merged) — PR:
6. **Flutter:** `firebase_core`, `firebase_messaging`, one `app/android/app/google-services.json` (both packages), the Gradle plugin,
   auto-init off until Notify me, topic sync (subscribe/unsubscribe/resync), foreground display with the
   shared tag, the three tap sources routed into the existing `alertTaps` path, the iOS row removed. The
   Halls-home landing itself is not here: it lands in #605's rework (M2 round 13). Reds: a fake messaging
   client that records calls (sync diff, retry after a throw, the 2000 cap, no call while Notify me has
   never been on, `deleteToken` on off), a manifest test for the auto-init key, and a test that each tap
   source reaches `alertTaps` — files: `app/lib/alerts/`, `app/lib/shell/`, `app/lib/screens/you/favorites_notify.dart`,
   `app/android/`, `app/ios/`, `app/pubspec.yaml` — lanes: flutter, A53 device run — blocked by: 1, #596,
   #605, owner steps 1-2 (and 3-4 for the device run) — PR:
7. **Retire the local check** (only if Open question 1 is answered "drop" and Task 6 is device-verified):
   `workmanager`, `alertsDispatcher`, `runAlertCheck`, `loadAlertBoard`, the BGTaskScheduler entry,
   `alert_sent` and its export, `user_version` migration — files: `app/lib/alerts/`, `app/lib/core/store/`,
   `app/lib/core/export.dart`, `app/android/`, `app/ios/`. Reds: a v(N) to v(N+1) migration test that drops
   `alert_sent` from a seeded database, the export test without it, and a manifest test that the WorkManager
   entries are gone — lanes: flutter — blocked by: 6 verified — PR:
   **Done 2026-10-21 (owner: "retire both"):** the WorkManager registration and dispatcher, `runAlertCheck`, `loadAlertBoard`,
   the BGTaskScheduler entry, the battery state and row. `workmanager` stays only to cancel the old job at boot
   (`cancelRetiredCheck`). **Left:** the `alert_sent` table, its export and the `user_version` migration (nothing writes it now).
8. **Residency and privacy policy:** a new row in CLAUDE.md's table and a note under "Data residency";
   the `docs/decisions-log.md` entry; the policy's Permissions paragraph ("doesn't send notifications",
   gh-pages `index.html:66`) rewritten to say what is sent to Google and that our server doesn't learn which
   dishes a user follows — files: `CLAUDE.md`, `docs/decisions-log.md`, and a PR to `gh-pages` (published at
   owenwang.dev/UDine; PRs into gh-pages skip `pr-gate`, #599) — lanes: none (docs) — blocked by: none, but the
   policy PR merges before the store build that carries Task 6 — PR:

## Owner answers (2026-10-17)

1. **WorkManager is dropped** (Task 7) once Task 6 is verified on the A53.
2. **Once a day.** Menus update daily, so the job fires at 11:00 and 12:00 UTC (7 AM Eastern in EDT and in
   EST). The function only sends between 7:00 and 9:00 AM Eastern, so the second firing is a no-op in EST,
   and in EDT it retries claims a failed send released. A dish that appears on the menu after the morning
   run isn't alerted that day.
3. **Topic key:** the existing `dishKey` normalization, 16 hex (64 bits).
4. **Variant families:** one topic per base dish name until round 12 lands.
5. **iOS row:** "Background App Refresh is off…" is removed with Task 6.

Known limit: FCM takes a while to propagate a new topic subscription, so a dish favourited just before the
morning run can miss that day's alert, like a dish added to the menu after it.
