# Flutter port: live menus, hours, events and busy, with an on-device cache

Goal: the Flutter app gets real data. That means every hall's and café's menu for any day in M2's
15-day range, hours, events, the dish catalog, live busy and the typical-busy curve. Menus are cached on
the device so a user with no signal still sees today and tomorrow. Every screen reads one repository and
gets M2's network states for free.

Roadmap and global decisions: `docs/briefs/flutter-port.md`.

## Spec

UI: none of its own. It exposes the states the screens render. Those are M2 R9 §4 ("Network.", NOTES
"Round 9" Design) and the `?net=slow|offline|fail` behaviour in `src.html`.
Annotations: none.
States (as data, each covered by a test; the screens show them, in recorded mode, with `?net=`):
- loading;
- loaded;
- loaded from cache while offline;
- offline with nothing saved for that place and day;
- failed (with retry);
- slow (the 400 ms indicator threshold is the screen's job; the repository reports "still loading").
Routes: none.

Backend: reads only. `public.dishes` with a paged delta on `updated_at`, the same query as
`shared/src/dishes.ts`, and `rpc/occupancy_typical`. Both go over Supabase REST with the publishable key,
anonymously. No new tables or functions.
Residency:
- "Menu cache: Device only, fetched straight from UMass Dining". Unchanged.
- "Dish nutrition catalog (`public.dishes`)" and "Hall occupancy history": public, read-only. Unchanged.

Rationale:
- **Sources are today's.** Each source comes straight from UMass, with no Supabase hop:
  - `foodpro-menu-ajax?tid=&date=` for halls and for cafés with a foodpro location id (see
    `mobile/src/lib/cafeMenu.ts` for which source applies to a café);
  - the retail HTML menu (items, PDF link or empty) otherwise;
  - `uapp/get_infov2` for hours, addresses and the live `business_level` triple;
  - `uapp/get_beacons_events` for events.
- **Caching follows M2 R9 §4.**
  - Photos, names and addresses are bundled.
  - Hours are cached for the day.
  - Menus are cached per place and day. Offline, today and tomorrow are kept.
  - Busy is live only and never shown stale.
  - This keeps the offline-first behaviour `main` shipped in #540 (cache-first render, no "show saved
    copy" step) and its 2-day window.
- **The cache lives in `udine.db`'s `preferences_kv`,** under new keys (`menu:v2:<place>|<date>`,
  `hours:v2:<date>`). RN's `menu_cache:*` entries are left alone: they're cache, and the device-data brief
  forbids rewriting RN rows.
- **Plain `http`, no Supabase SDK.** The app makes two anonymous REST calls. `supabase_flutter` arrives
  with sign-in, which is out of scope.
- **Prefetch on launch** of today and tomorrow for the four halls (as `mobile/src/lib/menuPrefetch.ts`
  does), so the first hall open doesn't wait on the network.
- Rejected: a background refresh task. That belongs to the favourite-alerts design (`m2-round-11`), not
  to this brief.

## Acceptance

- [ ] One repository (`app/lib/data/`) serves menus by place and day, hours, events, the dish catalog,
  live busy and the typical curve. It reports the states above, and is tested with a fake HTTP client
  using captured responses (the inline fixtures from `shared/src/*.test.ts` and
  `docs/design/explorations/2026-10-ui-overhaul/flows/*.json`) — evidence: test
- [ ] Offline after one online launch: today's and tomorrow's menus for every hall come from the cache
  with no network call. A day that was never saved reports "not saved" — evidence: test, then on the A53
  with `adb shell cmd connectivity airplane-mode enable` (confirm it's off again afterwards)
- [ ] Busy is never served from cache. When offline, the busy field is absent, not stale — evidence:
  test
- [ ] The cache is bounded: entries older than yesterday are deleted on launch — evidence: test
- [ ] The dish catalog delta resumes from the newest `updated_at` already held — evidence: test
- [ ] A recorded-data mode, in debug and profile builds only, feeds M2's recorded data through the same
  repository: `docs/design/explorations/2026-10-ui-overhaul/flows/menus-2026-10-08-to-22.json`, the
  locations and events JSON beside it, and RN's bake-off busy rows. It comes with a fixed clock (`?at=`)
  and the `?net=slow|offline|fail` simulation (the bake-off's `net.dart` behaviour), so every screen
  brief's screenshot can be set against M2's render of the same data. Release builds can't reach it —
  evidence: test (a release-mode build has no route to it)
- [ ] A live smoke run against the real endpoints (a debug route or a `flutter test` tag that's off by
  default) fetches today for all four halls and one café — evidence: output in the PR

## Tasks

1. **Fetch and cache** — HTTP client, menu/hours/events fetch on top of `core/` parsers, the
   `preferences_kv` cache, the state model, launch prefetch — files: `app/lib/data/`, `app/test/data/` —
   lanes: flutter — blocked by: shared-logic 2, device-data 1 — PR:
1b. **Recorded-data mode** — the source switch, fixed clock and `net=` simulation, read from route
   query flags — files: `app/lib/data/recorded/` — lanes: flutter — blocked by: 1 — PR:
2. **Supabase reads** — dish catalog delta and `occupancy_typical`, both cached for the day; the curve
   combined with live busy through `core/occupancy.dart` — files: `app/lib/data/` — lanes: flutter —
   blocked by: 1, shared-logic 5 — PR:
