# M2 round 11: packaged foods, favourite alerts, café PDF menus

Goal: three things today's RN app does, but M2 doesn't design, get one concept each in M2 before any
Flutter code. They are: finding packaged foods and reusing your own custom foods, being told when a
favourite is being served, and reading a café's PDF menu. Owner, 2026-10-13: "Design it in M2 first" for
all three.

Roadmap and global decisions: `docs/briefs/flutter-port.md`. Design only; no app code.

## Spec

UI: M2 (`docs/design/explorations/2026-10-ui-overhaul/flows/M2/`), as round 11. Method as in rounds 9
and 10:
- critique today's behaviour;
- write one spatial concept per item in `CONCEPT.md`, with ASCII frames, before building;
- build in `src.html`;
- add `test.js` `round11` scenarios, each shown red first (`RED=11`);
- add vectors for any new logic;
- record review passes in `NOTES.md`.

The orchestrator frame-reviews the build at 360 and 390 before the owner sees it. Prior art:
`design-briefs-concept-not-checklist` (concept, not checklist), and Task 16 of the bake-off plan.

**1. Packaged foods and saved custom foods.** What today's RN app does:
- the plate search's "Search UMass Dining directly" (`lookup-dish` edge function, rate-limited, token-AND
  matching, #538);
- OpenFoodFacts and USDA results (`shared/src/openFoodFacts.ts`, `usdaFoodData.ts`);
- custom foods saved for reuse (`custom_foods` table, `customFoodsStorage.ts`).

M2 today has only a one-off custom form, reached from Search's no-match and menu-less cafés. The concept
must answer:
- where packaged and saved foods appear in Search, and how they differ visibly from dishes being served;
- how a saved custom food is reused and edited;
- how lookup in flight, found, none, offline and rate-limited read (today's states, #540);
- and what a packaged food's dish sheet shows when it has no grades, stations or hours.

**2. Favourite alerts.** Today, for signed-out users, a background task about every 15 minutes warms the
menu cache, matches favourites against today's menus (`shared/src/favoriteMatch.ts`), and posts a local
notification (`mobile/src/lib/backgroundTask.ts`, `notificationHandler.ts`, `food_sighting_dedup`).
M2 has Favorites as a list only. The concept must answer:
- where alerts are turned on (and the OS permission ask: M2 R10 §5's no-interstitial pattern is the
  precedent);
- what the notification says and what tapping it opens (the dish sheet's "where it's served" target is
  the obvious landing);
- one notification per dish per day (the dedup rule today);
- and what a user sees when the OS has background work or notifications blocked.

The Android floor is WorkManager's 15-minute minimum; iOS background fetch is best-effort. Both are
written in the concept as limits, not hidden.

**3. Café PDF menus.** Today, a café whose retail menu is a PDF link (`shared/src/content.ts`
`RetailMenuPdf`, host-gated to umassdining.com) opens it in a WebView running pdf.js
(`CafePdfViewer.tsx`). M2's café page shows a names list or "doesn't list its menu" (CONCEPT R9 §5). The
concept must answer:
- how the café page offers the PDF;
- whether it opens in place (a sheet or page in M2's motion vocabulary) or hands off to the system
  viewer;
- and what offline does.

Find which cafés publish a PDF today from the live retail feed and record the list in NOTES.

Annotations: none.
States: listed per concept in `CONCEPT.md` round 11, each with a `test.js` scenario.
Routes: `m2.html` with round-11 query flags (for example `?lookup=found|none|offline|limited`,
`?alerts=allow|deny`, `?cafe=<pdf café>`).

Backend: none. `lookup-dish` exists. Whether alerts ever move server-side (the signed-in push path on
`archive/full-features`) is out of scope.
Residency:
- saved custom foods: "Device only";
- favourites and their dedup: device-only while signed out, as today.

The concept must not add a server call that RN doesn't make today.
Rationale: the owner's rule since the M2 build started is "don't just tack it on" for features M2 doesn't
specify. Rejected:
- porting today's three behaviours into M2's screens without a design pass;
- and dropping them.

## Acceptance

- [ ] One concept per item in `CONCEPT.md` round 11, written before the build — evidence: diff
- [ ] Built in `src.html`; `test.js` `round11` passes, each scenario shown red first — evidence: test
- [ ] Frame review at 360 and 390 by the orchestrator, with crops in NOTES — evidence: screenshot
- [ ] The Flow Lab page links round 11's shots, and the owner approves — evidence: owner
- [ ] The Flutter build briefs for round 11 are written from the approved concept — evidence: diff

## Tasks

1. **Round 11 design and build in M2** — files: `docs/design/explorations/2026-10-ui-overhaul/flows/M2/`
   — lanes: M2 `test.js` (Playwright: a heavy job, never alongside Gradle or an emulator) — blocked by:
   none — PR:
2. **Flutter briefs from the approved round** — `flutter-port-packaged-foods`,
   `flutter-port-favorite-alerts`, `flutter-port-cafe-pdf` — files: `docs/briefs/` — lanes: none —
   blocked by: 1, owner approval — PR:
