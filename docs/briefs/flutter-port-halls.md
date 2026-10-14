# Flutter port: shell, Halls tab, cafés

Goal: the Flutter app opens to M2's Halls tab, with real hours, status and busy for the four halls, pinned
cafés, and the cafés and markets list. Halls, Search and You switch with M2's fade-through. A café opens as
the same page a hall does. Navigation is a real stack, so a page can push another page and come back.

Roadmap and global decisions: `docs/briefs/flutter-port.md`.

## Spec

UI (M2, `docs/design/explorations/2026-10-ui-overhaul/flows/M2/`):
- **Shell:** three tabs with fade-through, and the plate bar slot above the tab bar on every tab. CONCEPT
  "The vocabulary" and "Motion vocabulary"; NOTES (a); `src.html` 598–636. The plate bar's content is
  `flutter-port-dish-and-plate`; this brief reserves its slot and motion.
- **Halls tab:** the date line; four duotone bands with letter, hours and busy lamps (letter x per NOTES
  "Round 9c" Letters and "Round 10" Letters, including F at 99); pinned café bands (84 px; 0, 2 and 5
  pins); area rows "Cafés & markets" with "N of M open". `#bands #pins #areas`, `renderPins`,
  `renderAreas`.
- **Container transform** from a band or pin into its page, drag-down and edge-swipe back. CONCEPT
  "Motion vocabulary". The hall page's content is `flutter-port-hall-menu`; this brief owns the transform
  and the stack.
- **Cafés & markets page** (push): the "Open now" chip, sticky area headers, nearest area first.
  `pageContent('cafes')`, NOTES "Round 7".
- **Café page:** the hall page without letter, busy or board, plus the pin button. A single-meal café has
  no tab row. A menu-less café shows its names list or "doesn't list its menu" (CONCEPT R9 §5). Café PDF
  menus are **not** in this brief: they wait for `m2-round-11`.
- **Network states on Halls** (CONCEPT R9 §4):
  - loading: status and busy arrive in place;
  - offline: no busy, and "You're offline" under the date;
  - failed: names and letters only, with "Couldn't connect" and Try again.
- **Charles River Campus:** places and pins hidden unless the You toggle is on (NOTES "Round 9b").
  Terrace is always in. This brief adds the filter in one place that the cafés list, the pins, the area
  counts and Search all read, closing the bake-off's departure.

Annotations: none.
States:
- Halls at 360 and 390 dp with 0, 2 and 5 pins;
- loading, offline and failed;
- a hall closed for the day;
- the cafés page with "Open now" on and off;
- a café page: dishes, single-meal, names list, no menu;
- the container transform mid-flight (frames);
- a push from a pushed page and back (the stack).
Routes: `/halls`, `/halls?pins=5`, `/cafes`, `/cafe/<id>`. Add `?net=offline|fail|slow`, and a fixed
clock for goldens (`?at=2026-10-08T12:41`). Record a band open/close, a drag-down and a pin open with
`--record`.

Backend: none (reads through `flutter-port-menu-data`).
Residency: pins are a device-only preference (`preferences_kv`), like the hall order RN keeps locally
today.
Rationale:
- **A real stack.** The bake-off's push holds one page (README departure). M2 stacks pages (an event page,
  then "See the menu", then a dish's "where it's served" hall). `motion/push.dart` becomes a stack of
  routes, each with its own transition (container transform or push), on top of Flutter's `Navigator`
  with custom `PageRoute`s. A router package isn't needed: the only deep links are screenshot routes.
- **A band tap during a close** is taken, not swallowed (README departure). M2's `xfOn` guard covers only
  the drag-back touchstart (`src.html` around 1455).
- **Photos ship, but never in git** (owner, 2026-10-14: "Ship UMass's photos anyway", against the explorations README's note;
  the owner takes the risk). `app/assets/photos/` is gitignored and filled by `app/tool/link_photos.sh`; a checkout without
  them builds and runs with the bands' duotone ground. Goldens draw none. Bands and pins draw M2's own treatment
  (`Photo`: grayscale, multiply, screen) and nothing else.
- Owner-accepted departures carried over unchanged:
  - `bold700`;
  - 44 dp targets on the status line;
  - whole-dp line rounding;
  - the Android system back gesture owning the left edge, until `flutter-port-release` adds predictive
    back.

## Acceptance

- [ ] Goldens at 360 and 390 for every state above, and the M2 DOM measurements (`m2_dom.json`) for bands,
  pins, area rows, the date line and café rows within 1 dp — evidence: test
- [ ] A device screenshot of each state next to M2's own render at the same width. Render M2 with its
  `shot.sh` (Playwright: a heavy job, never alongside Gradle or an emulator) — evidence: screenshot
- [ ] Frame strips of the band open/close, drag-down, edge swipe and tab fade-through next to M2's
  `compare-open.png`, `compare-close.png`, `compare-dragback.png` and `compare-edgeswipe.png`, plus a
  janky-frame count on the A53 (`dumpsys gfxinfo`) no worse than the bake-off's hall open (3.2%) —
  evidence: screenshot (strips) + numbers in the PR
- [ ] Reduced motion swaps each transform for M2's crossfade — evidence: test
- [ ] A pushed page can push again and come back, in order, with drag-back working at each level —
  evidence: test
- [ ] With the Charles River toggle off, its places are absent from pins, area counts, the cafés list and
  Search's place results; with it on they all appear — evidence: test

## Tasks

1. **Shell, stack and Halls tab** — `main.dart`, the tab shell, the navigation stack, bands and pins with
   live data and the network states — files: `app/lib/main.dart`, `app/lib/shell/`, `app/lib/motion/`,
   `app/lib/screens/halls/` — lanes: flutter — blocked by: menu-data 1, menu-data 1b — PR:
2. **Cafés page and café page** — the list, the area headers, the café page on the hall page's body (a
   stub body until `flutter-port-hall-menu` lands; it then shares the hall body), the pin button, the
   Charles River filter — files: `app/lib/screens/cafes/` — lanes: flutter — blocked by: 1 — PR:
