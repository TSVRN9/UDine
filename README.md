# UDine

A calorie and macro tracker for UMass Amherst dining, with a social layer on top — built because the
official UMass Dining app shows you nutrition facts but won't let you *do* anything with them. UDine
covers what the official app does (menus, dietary filters, favorites, events, press) and adds the
parts we actually wanted: log what you eat straight off the real menu, see your day's macros, rank
dishes against each other, get pinged when a friend wants company at Berkshire, and get notified
when a favorited dish shows up somewhere unexpected.

There are two clients — a SvelteKit web app and a React Native (Expo) app — sharing one core
package, so features land in both or neither.

## What it does

- **Menu browsing with real nutrition data** — every dining common, every meal period, full
  nutrition panel per dish, sourced live from UMass Dining's own menu endpoint. You can browse
  upcoming days too (UMass publishes about two weeks ahead).
- **Food logging + daily macros** — tap a dish, log a serving, watch the day's calories/protein/
  carbs/fat add up. Foods that aren't on a UMass menu come in via OpenFoodFacts barcode lookup.
- **Dietary and allergen filters** — hide what you can't eat, with an honest "your filters are
  hiding N dishes" note instead of silently vanishing food.
- **Beli-style dish ranking** — pairwise "which did you like more?" comparisons build a personal
  ranking of dishes (and, derived from that, your favorite dining halls). The official app only has
  a binary favorite star.
- **Friends and pings** — "come eat with me" with a hall and a message.
- **Favorited-food alerts** — a scheduled job watches all four halls' menus and pushes a
  notification when a dish you favorited appears.
- **Data export** — your full log, as JSON or CSV, any time.

## The one design decision that shapes everything: your food data stays on your device

What you eat is health data. UDine treats it that way: the consumption log, macro history, and dish
rankings live **only** in on-device storage (IndexedDB on web, SQLite on mobile) and never touch our
server. There's no account requirement for any of it — menus, logging, filters, ranking, and export
all work signed out. Signing in (Google, `@umass.edu` accounts only) adds exactly the features that
can't exist without a server: friends, pings, cross-device favorites, and push alerts. Nothing else.

A few consequences of taking this seriously:

- Dish rankings stay device-only even though syncing them would be easy — a per-dish ranking is
  reconstructible into an eating history, so it gets the same protection as the log itself. The only
  ranking-derived thing the server ever sees is your favorite *dining halls* (a handful of building
  IDs), which powers pings without exposing what you ate.
- Export isn't a nice-to-have; it's the release valve that keeps "your data never leaves the device"
  from also meaning "your data is trapped on the device."
- The e2e suite enforces it: tests assert the anonymous pages make zero cross-origin or API calls.

## Architecture

```
/web        SvelteKit app
/mobile     React Native (Expo) app
/shared     @udine/shared — types, API clients, macro math, ranking. Both apps depend on it.
/supabase   migrations, edge functions, pgTAP tests
/docs       reverse-engineering notes and reference docs
```

**Parity by construction, not discipline.** Menu fetching/parsing, macro math, the ranking
algorithm, and content-feed clients live in `@udine/shared`. The apps are mostly UI over that
package, so behavior can't quietly drift between platforms.

**Menu data comes from UMass Dining directly.** The official app turned out to be React Native +
Hermes under the hood; we reverse-engineered it (see `docs/apk-reverse-engineering.md`) and found
the same public endpoint the website's menu picker uses: `foodpro-menu-ajax?tid=<hall>&date=…`,
which returns each dish's full nutrition panel as data attributes on HTML fragments. The shared
package parses that; the web app proxies it through a thin SvelteKit route purely because
umassdining.com sends no CORS headers. Nothing menu-related is stored server-side — the anonymous
path has no database in it at all.

**The social slice is Supabase.** Postgres with row-level security on every table (friendships,
pings, favorited foods, push tokens, food sightings), Google OAuth restricted to `@umass.edu` via a
before-user-created auth hook, and an edge function on a `pg_cron` schedule that matches live menus
against favorited foods and dispatches Web Push + Expo notifications. RLS is tested with a pgTAP
suite against a throwaway local stack — policies like "only an accepted friendship can send a ping"
are enforced in the database, not trusted to clients.

**One design system, two renderers.** The web app defines the palette and component vocabulary
(Tailwind theme tokens + a small component layer); mobile mirrors it token-for-token in a
`StyleSheet`-based theme with matching components, and a unit test pins the hex values so the two
can't drift apart silently.

## Development

pnpm workspace. The CI lanes (shared unit tests, svelte-check, Playwright e2e, mobile typecheck +
jest, Deno edge-function tests, pgTAP) are documented at the top of `.github/workflows/ci.yml` —
they run locally (hosted runners are intentionally disabled; `gh act` works too, config in
`.actrc`). Playwright takes a `PORT` env var so parallel checkouts don't collide.

Android native builds need JDK 17 — see `CLAUDE.md` for the exact incantation and other
machine-setup notes.

## Deliberate non-goals

- BLE beacon check-ins (official-app feature; needs hardware we don't have).
- UMass Dining's own account system — we have our own auth and store far less.
- FAQ and staff directory screens — cut on purpose; this is a macro tracker with friends, not a
  brochure.
