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

## Backend

- Supabase project: **UDine** (`ubogyqskqzvkcqboqbhw`, org `tsvrn`, us-east-1, free tier).
- An older unrelated project **bricktime** (`nhxsplkkwcscoyhibotc`) still exists in the same org —
  the user asked to delete it, but the Supabase MCP toolset has no `delete_project` call. Delete it
  manually from the dashboard if it's still unwanted; do not attempt to repurpose it.
- Auth: Supabase Auth, Google OAuth provider. Client ID/secret supplied by the user (Google Cloud
  project not yet created/shared) — treat as a documented TODO until provided; do not stub in fake
  keys.
- **`@umass.edu` restriction is NOT enforced by Google's `hd=` param** — that's a client-side UI hint,
  trivially bypassed. Enforce it server-side: a Postgres trigger on `auth.users` (or a Supabase Auth
  hook) that checks `email_confirmed_at` + `email ILIKE '%@umass.edu'` and rejects/deletes the row
  otherwise. Write this before wiring up the OAuth button, not after.

## Data sources

| Source | What it gives us | Notes |
|---|---|---|
| `umassdining.com/foodpro-menu-ajax` | Menu items per dining hall/date/meal | Exact query params unconfirmed (see RE doc) — validate against live requests, don't guess-and-ship |
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
| Menu cache (dining hall items, nutrition facts) | Server (Supabase) or direct API passthrough | Public data, not personal |
| Dish/location ranking **inputs** (raw pairwise comparisons) | **Device only** | These are derived from what the user ate — same sensitivity as the log |
| Dish/location ranking **outputs** (computed rank order, "favorite dining hall") | Server, if the user is signed in | Needed for friend pings ("come eat with me at your favorite spot") and cross-device sync; user must opt in by signing in — anonymous users keep rankings device-only |
| Favorited foods (for "spotted elsewhere" alerts) | Server, only if signed in and notifications enabled | Requires server-side matching against the menu feed to push a notification; anonymous users can still favorite locally but get no alerts |
| Friends, pings, profile | Server (requires account by definition) | |
| Auth identity (email, Google sub) | Server (Supabase Auth) | |

Anonymous-first: menus, nutrition lookup, events, press releases, FAQ, dietary filters, and local
logging/ranking must all work with **zero account**. Signing in only gates: friends, pings,
cross-device sync, favorited-food push alerts, and server-stored ranking outputs. If a feature can be
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
