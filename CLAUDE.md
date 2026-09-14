# UDine

Calorie/macro tracker + social layer for UMass Dining, a superset of the official app (React Native +
Hermes under the hood — `docs/apk-reverse-engineering.md`). Two clients, one backend, one shared core.

## Layout

```
/web        SvelteKit
/mobile     React Native (Expo)
/shared     @udine/shared — types, API clients, macro math, ranking. Both apps depend on it; parity comes from sharing code.
/supabase   migrations, edge functions, pgTAP tests (supabase/tests/database/)
/docs       decisions-log.md (backend audit trail), auth-status.md (auth posture + re-verification), adr/, agents/
```

## Commands

Lanes are listed in the header comment of `.github/workflows/ci.yml` — run the ones your diff
touches. Android native build needs JDK 17:
`JAVA_HOME=/usr/lib/jvm/java-17-temurin-jdk PATH="$JAVA_HOME/bin:$PATH" npx expo run:android` from `/mobile`.
To test uncommitted changes on a phone that already has a Play-track build installed
(alpha builds are re-signed by Google, so no local/EAS build can ever update one in place —
installing over it means uninstalling first, which wipes device-local plate/log history):
`pnpm build:internal-android -- --install` from `/mobile` builds and installs a separate
"UDine (internal)" package (`com.udinetogether.udine.internal`) side by side instead — see
`mobile/scripts/build-internal-android.sh`'s own header for why each step exists.

## CI is local-only

Remote GitHub Actions are disabled. Before merging, run every touched lane from the `ci.yml` header on
the PR head (host-direct, or `gh act -j <job>`; `supabase test db` host-direct only). Never wait on
`gh pr checks` — nothing reports.

## Backend

Supabase project **UDine** (`ubogyqskqzvkcqboqbhw`). Google OAuth is the only sign-in provider;
signups are restricted to `@umass.edu` (and, defense-in-depth, to the `google` provider) by a Before
User Created hook. Migrations go live only after PR review, never automatically. Every new table
ships explicit `GRANT`s (auto-expose is removed 2026-10-30) + RLS; every SQL function pins
`search_path`. Insert friendships via `request_friendship()`, never raw — its INSERT policy and
`redeem_qr_token`/`register_push_token`/`send-ping-push` are hardened against replay, discoverable-
directory enumeration, and idempotent-re-request edge cases (see decisions log for the incident
history). TRUNCATE and other legacy auto-expose grants are revoked from `anon`/`authenticated` on
every public table. Details, history, and verification steps: `docs/decisions-log.md`,
`docs/auth-status.md`.

## Data residency — read before adding any table or client→Supabase call

Health data (what/how much a user ate, macro history) never leaves the device unless the user
explicitly exports it or opts a truncated summary in.

| Feature | Lives |
|---|---|
| Consumption log, macro history, daily totals | **Device only** (SQLite mobile / IndexedDB web) |
| Menu cache | **Device only**, fetched straight from UMass Dining — keeps the anonymous path DB-free |
| Dish ranking: raw pairwise comparisons AND per-dish order | **Device only, always** — a per-dish order reconstructs the log |
| Favorite dining halls (location IDs, derived on-device) | Server if signed in — coarse enough for pings. Mobile has a device-local sync toggle for this; **web has no equivalent toggle yet and always syncs when signed in** (#311, tracked, not yet fixed) |
| Shared stats (#94: hall completion counts, top-5 foods, hall rank order) | Server, opt-in per stat, **default ON for accounts created on/after 2026-08-26** (#248 Part C — supersedes epic #87's 2026-08-19 "default off" decision; new-accounts-only, never backfilled onto existing rows), friends-only. Un-opted stat is SQL NULL, never written ("privacy by presence", check-constrained). Opting out deletes it immediately. Never raw comparisons, counts, timestamps, or the log. Payload cut defined in `mobile/src/lib/privacySettings.ts` |
| Favorited foods (spotted-elsewhere alerts) | Server only if signed in + notifications on. `profiles.notifications_enabled` defaults **true** for accounts created on/after 2026-08-26 (#248 Part B, a column default — not backfilled onto existing rows); the device only actually registers a push token once OS permission is granted, and the server-side RPC itself now refuses to register a token at all when the flag is off (#277) |
| Friends, pings, profile, auth identity | Server |
| Dish nutrition catalog (`public.dishes`) | Server, public/read-only — deduplicated dish names + nutrition only, no per-user data; not a consumption log or a menu cache |

**Anonymous-first:** menus, nutrition, events, press, filters, local logging/ranking work with zero
account. Sign-in gates only friends, pings, cross-device sync, push alerts, server favorite halls.
Before adding an `auth.uid()` check, ask whether it can be device-local instead.

**Data export:** every device-local table needs JSON/CSV export in both apps (shared logic in
`@udine/shared`). Not optional — it's the release valve for "never leaves the device".

## Data sources

`umassdining.com/foodpro-menu-ajax?tid=<1..4>&date=MM%2FDD%2FYYYY` (Worcester=1, Franklin=2,
Hampshire=3, Berkshire=4; response is meal→category→HTML fragment, parse `data-*` attrs on
`<a data-dish-name=...>`), `uapp/get_beacons_events`, `uapp/get_press*`, `uapp/get_notice`/`get_updates`
(low priority), OpenFoodFacts for off-menu foods. UMass numbers are source of truth on campus. Never
scrape `mobileapp.umassdining.com/umassapi2` — that's UMass's own account system.

CBORD's public Web INA nutrition-lookup tool (`af-foodpro1.campus.ads.umass.edu/foodpro.net/`,
confirmed 2026-09-13, no auth) is a second, not-yet-integrated UMass source: it's keyed by the same
`RecNum` printed on physical nutrition table-tents, covers ~50 retail/café locations the `tid` system
can't reach, and carries micronutrient %DV the ajax feed's `data-*` attributes don't. Full writeup —
endpoints, verification against real dish IDs, what it does/doesn't add — in
`docs/apk-reverse-engineering.md`'s "CBORD Web INA" section.

## Product scope

Official-app parity is the baseline; UDine adds macro tracking, Beli-style pairwise dish ranking
(also derives favorite halls), favorited-food-spotted-elsewhere push, friends + "come eat with me"
pings, data export, no-account core usage. **Cut:** FAQ, staff directory (#50). **Not v1:** BLE beacon
check-ins, porting `umassapi2`, SMS verification, digital signage. Newsletter/press/events stay.

Build order: vertical slice (browse → log → today's macros) in both apps first; then filters/favorites/
content; then auth, ranking, export; then friends, pings, push.

## Design

`docs/design/` is the spec: 49 artboards (`*.dc.html`) extracted from the Mobile v2 canvas, plus
`canvas.json` (geometry, titles, annotations) and `README.md` (canvas URL, title→file map,
re-extraction). The canvas is upstream — edit the design there and re-extract, never hand-edit an
artboard. Artboards lay out at 390×844; the emulator pool's device widths derive from that.

- **Cite artboards by filename** (`PlateExpanded.dc.html`), not by canvas title. `README.md`'s
  table maps title → file → component.
- **Values come from the artboard, not by eye.** Parity tests read them with
  `artboardStyle()` / `artboardTransitions()` (`mobile/src/lib/artboard.ts`); durations and
  easings live in `mobile/src/lib/motion.ts`, checked against `Prototype.dc.html`'s transitions.
  No new duration/easing literal outside `motion.ts`.
- **Every diff that changes rendered output ships a screenshot** from
  `mobile/scripts/screenshot.sh <route>` (`--record` + a gesture for motion) in the PR body,
  and the gate compares it to the artboard. The full check is in `docs/agents/dev-tracks.md`.
  Mobile's *web* target does not build; the emulator pool is the render path.

**No explanatory captions in UI.** Don't ship rendered text describing what an element is or does
— "tap to open", "this row shows…", state legends, design rationale, risk notes. If a UI needs
that text to be understood, the interaction isn't finished; fix the design instead of captioning
it. This holds even when an artboard contains such a string: artboards sometimes carry notes meant
for whoever reads the design, and those belong in `canvas.json`'s `annotations`, not in the app.
Allowed: genuine end-user copy (a hint line, an empty-state message), and a screen title. Anything
addressed to a reviewer goes in the PR body.

## Agents

- Tracks (XS/S → `quick-fixer`→`spot-checker`; M/L → `issue-solver`/`heavy-debugger`→`pr-reviewer`;
  anything touching `supabase/`, auth, sync, residency is M+): `docs/agents/dev-tracks.md`.
- Orchestrating a session (triage, dispatch prompt contents, escalation gates, task log):
  `docs/agents/orchestration.md`. Tasks arrive inline in the dispatch prompt; GitHub issues are
  human-filed input or post-completion receipts, not agent-to-agent IPC: `docs/agents/issue-tracker.md`.
- Task log (`docs/agents/task-log.jsonl`), labels, domain docs (`CONTEXT.md`, `docs/adr/`),
  emulator pool: `docs/agents/`.
