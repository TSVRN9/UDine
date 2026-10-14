# Flutter port: favourite alerts

Goal: a user who turns on "Notify me" gets one notification when a favourited dish is on today's menu. It says
where and when it's served, and tapping it lands on that dish in that hall at that meal. It works without an
account, with every check made on the phone.

Roadmap and global decisions: `docs/briefs/flutter-port.md`. Design approved by the owner on 2026-10-14 (#562).

## Spec

UI: M2 R11 §2 (`CONCEPT.md` "Round 11", section 2), NOTES "Round 11" and "Round 11b" (the 12 px gap under a
wrapped subtitle).
- **The switch:** a "Notify me" check row ("When a favorite is on today's menu") at the top of the Favorites page.
  Tapping it raises the OS's own sheet, with no screen of ours first (as Health does, round 10).
- **Tracking off keeps it.** Alerts are a menu feature, not the ledger's (M2 R11 §2), so the row and the alerts
  stay when tracking is off.
- **Not allowed:**
  - blocked: the tap goes straight to the denied state, with no OS sheet;
  - denied or blocked reads "Notifications are off for UDine" with Open Settings;
  - revoked is the same state, found by re-checking the permission when You is shown and when the app resumes;
  - when background work is off, the row stays on and says why: iOS "Background App Refresh is off, so UDine
    can't check menus"; Android "Battery use is restricted, so UDine can't check menus". Both have Open Settings.
- **The notification:** the dish's name, then the dish sheet's "where" sentence ("Lunch from 11 AM at Worcester
  and Berkshire"; "Lunch now, until 4:30 PM, at Worcester and Berkshire"). It doesn't repeat itself and doesn't
  say "a favorite of yours".
- **The You row** stays "2 dishes" and adds nothing about notifying (the as-built departure from the concept,
  recorded in CONCEPT "Round 11, as built"; build that, not the concept's version).
- **Tapping it** pushes the hall at that meal, scrolled to the dish and marked.
- **One per dish per day,** with every place in one body. Not before 7 AM, and never once the dish's last serving
  that day has ended.
- **Limits, stated, not hidden:**
  - Android: WorkManager's 15-minute floor;
  - iOS: background fetch is best-effort.

Annotations: none.
States:
- off, allowed, and tracking off with alerts on;
- denied, revoked;
- background off on iOS, background off on Android;
- the notification, and landing on the dish.

Routes: `/you/favorites`; the notification tap is a deep link (`/hall/<slug>?meal=…&dish=…`).

Backend: none. The check reads the cached menus through `app/lib/data/` (the same fetch as the app), offline-
first.
Residency: "Favorited foods: Server only if signed in + notifications on". The signed-out path is device only,
which is the only path the port has. Favourites stay device-only. A new device table, `alert_sent(dish_name TEXT,
day TEXT, PRIMARY KEY(dish_name, day))` (`user_version` migration; `day` is the logical day after the 2 AM rollover, `core/date.dart`), records what was sent; RN's
`food_sighting_dedup` is per hall and is left untouched. Exported like every table.
Rationale:
- **Matching is `core/favorite_match.dart`,** the rule shared with TS and Deno (`shared/vectors/favorite-match.json`).
- **Packages:** `workmanager` (Android WorkManager / iOS BGTaskScheduler) and `flutter_local_notifications`, named
  here as the brief's two additions. Run the check in a background isolate that opens the store and the cache
  read-only, apart from `alert_sent`.
- **Pointer, not spec:** how a favourited variant family matches is being designed in `m2-round-12` (variant
  pickers); M2 R11 doesn't cover it. Follow round 12 once approved.

## Acceptance

- [ ] The background check posts one notification per dish per day, with all places in the body, never before
  7 AM or after the last serving, and never while Notify me is off — evidence: test (fake clock, fake menus,
  fake notifier)
- [ ] Permission states (allowed, denied, revoked, background off on each OS) render as M2 shows; Open Settings
  opens the right settings page — evidence: test + device screenshot on the emulator (and the A53 once it can
  take the Flutter build)
- [ ] Tapping the notification lands on the dish in that hall and meal, marked — evidence: device recording
- [ ] `alert_sent` is exported — evidence: test

## Tasks

1. **Background check:** scheduling, matching, dedup table, and the notification with its deep link — files:
   `app/lib/alerts/`, `app/lib/core/store/`, `app/lib/core/export.dart`, `app/android/`, `app/ios/` — lanes: flutter, a device run —
   blocked by: hall-menu 1, you 2, device-data 2 — PR:
2. **The Favorites row and its states,** and the landing — files: `app/lib/screens/you/favorites*.dart` — lanes:
   flutter — blocked by: 1 — PR:
