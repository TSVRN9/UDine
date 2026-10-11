# Hall menu bake-off: React Native vs Flutter on the M2 design

Goal: the owner can hold two builds of the redesigned core loop on a phone and pick the stack the
whole app is rebuilt on. The core loop is: open a hall, browse a meal, open a dish, add it, adjust
the quantity, and log the plate. One build is React Native rebuilt on native primitives with a design
kit; the other is Flutter. Both copy the M2 prototype. Neither ships. The verdict decides Phase 4 of
the UI overhaul plan.

## Spec

UI: the M2 prototype, not the canvas. This is a deliberate exception for throwaway code. M2 goes onto
the canvas as artboards after the verdict and before the real rebuild.
- Source: `docs/design/explorations/2026-10-ui-overhaul/flows/M2/`, specifically:
  - `src.html`, `build.py`, `CONCEPT.md` ("Motion vocabulary"), and `NOTES.md` (rounds 1–9);
  - the RN porting notes in NOTES' "Native port" section.
- The built `index.html`, screenshots and compare strips are in the gitignored `local/flows/M2/` on
  the owner's machine. Published copy: https://claude.ai/artifact/4bxHWnGM5soyTVQoSJhs2z.
- Tokens: colours, type, spacing, and the `MO`/`SPRING` motion tokens in `src.html`.

Annotations: none (no canvas yet). Motion rules are `CONCEPT.md`'s "Motion vocabulary":
- container transform for hall bands and pinned cafés only;
- push from the right with an interactive edge swipe for events, café rows and You rows;
- a bottom sheet for dish detail;
- fade-through for tabs;
- shared axis for meal tabs.

States: every state a build must show, each matched against M2's screenshot of the same state:
- **Halls tab:** at rest; with 0, 2 and 5 pinned cafés; loading; offline with cache; fetch failed (from
  round 9).
- **Hall menu:** top; scrolled with the header collapsed; each meal tab; the station switcher open; the
  day control on another day; hours and directions open (round 9); the diet/allergen "Show all" line;
  empty meal.
- **Dish sheet:**
  - at rest and scrolled (pinned name edge);
  - from the hall, from the plate, and the sheet → hall push;
  - score badges off, health on, carbon on, and both on;
  - unscored dish;
  - price present and absent.
- **Plate:** bar empty and with items; the stepper at 1, ½ and removed; the sheet open; Log with its
  receipt and Undo; a second plate from a conflicting hall.

Routes: RN uses `mobile/scripts/screenshot.sh` on the bake-off route(s) with `--record` plus the gesture
for each motion. Flutter uses integration-test screenshots on the same emulator-pool device. Both
record these at 390×844:
- hall open, close, drag back and edge swipe;
- meal tab swipe;
- station jump;
- the dish sheet open, drag and dismiss;
- add, stepper, plate sheet drag, and Log.

Backend: none. Both builds read a fixed fixture, never the network:
- the Oct 8–9 menus, locations and events in `docs/design/explorations/2026-10-ui-overhaul/flows/*.json`;
- a fixed clock of Thursday, Oct 8, 12:41 PM, the same as M2.

Residency: no change. The plate log in each build is device-only, the same as the consumption log
row. Nothing is synced.

Rationale:
- **Why a bake-off:** the evidence for "rewrite" was ambiguous. The look and the missing primitives were
  the main problems, not the framework. Building the most demanding slice twice settles it on feel
  instead of argument.
- **Rejected:**
  - Capacitor/WebView, on feel;
  - skipping the bake-off, because it's riskier to switch later;
  - building on the canvas first, which would be slower and throwaway either way.
- **Flutter is judged on Android only** (owner, 2026-10-11). EAS can't build Flutter for iOS, and the
  owner declined Codemagic and a GitHub Actions macOS runner. RN gets one TestFlight build (1 of the 15
  free monthly). The scorecard notes that Flutter's iOS behaviour wasn't seen. Flutter draws the same
  pixels on both platforms, so that matters less than it would for RN.

### Owner decisions this brief carries (2026-10-11)

- **Allergens:**
  - Avoiding an allergen joins Dietary preferences on You and hides matching dishes everywhere,
    behind the same "Show all" line M2 already uses.
  - The current FilterSheet's macro, station and price filters are dropped; Search's chips cover
    macros.
- **Quantity:** the M2 stepper only (1 → ½ → remove). Hold-and-slide is dropped.
- **Price:** on the dish sheet only, when the feed has one. Rows don't show it.
- **Designed in M2 before any build (round 9):**
  - a day control for a hall menu across the feed's roughly two-week window;
  - today's full hours and directions, reached from the hall header;
  - allergens in Dietary preferences;
  - loading, offline-with-cache and failed-fetch states for the Halls tab and hall menu;
  - price on the dish sheet.
- **Bowl builder:** designed in M2 (round 10) in parallel with the builds; not in bake-off scope.
- **Deferred to the full-rebuild spec, with the owner asked per feature then:**
  - log history and editing;
  - ranking allowance, skip and the post-log prompt;
  - Top Foods scores, Favorite Halls and Hall Completion;
  - export store picking;
  - local favourite alerts and notification permission;
  - saved custom foods and OpenFoodFacts/USDA search;
  - event Share;
  - every `archive/full-features` feature (sign-in, friends, pings, QR, privacy).

### Build variants (serial: RN, then Flutter, because of the host memory budget)

**(a) React Native**, branch `bakeoff/rn`:
- Lives in the existing Expo app as a separate route group reached from a dev-only entry, leaving
  the shipped screens untouched.
- Native primitives:
  - `@gorhom/bottom-sheet` v5 for the plate and dish sheets (the bar is the sheet's handle, per
    NOTES' native port);
  - Reanimated 4 shared values for the container transform and the edge swipe;
  - FlashList or LegendList for the menu;
  - the station switcher on the UI thread (no `runOnJS` per frame);
  - `expo-haptics` as NOTES specifies.
- A kit in `mobile/src/components/ui/`: Sheet, ListRow, Band, Badge, ScoreBadge, Chip, Stepper,
  Header.
- M2 tokens in `theme.ts` and `motion.ts`.
- A lint rule bans raw colour, size and duration literals outside `ui/`, `theme.ts` and `motion.ts`.
- Reuses `@udine/shared` and the pure helpers in `mobile/src/lib`.
- New native dependencies mean rebuilding the dev client; see the memory note on dev-client staleness.

**(b) Flutter**, branch `bakeoff/flutter`, in `flutter/`:
- The same scope.
- Ports only the logic the screens need to Dart: sections, plate maths, where it's served now/next,
  scores.
- A `ThemeData` plus a tokens file from M2.
- Golden tests on Linux.
- Android only.

Neither branch merges to `main`. Each variant is one draft PR against `main` for review only. The
pr-reviewer compares it to M2's screenshots and strips, not to artboards. `pr-gate.sh`'s artboard and
merge checks don't apply; its motion-literal check does, for RN.

### Scorecard (goes into `docs/decisions-log.md` with the verdict)

1. **Feel.** The owner rates each build on Android, and the tester rates RN on iOS. The owner can
   overrule everything below.
2. **Frame timing.** Dropped frames during the hall open, the edge swipe, the dish sheet drag, the plate
   sheet drag and a fast menu fling. RN is measured with the perf monitor or systrace, Flutter with
   DevTools.
3. **Design fidelity and agent adherence.** The REWORK rounds needed to reach MERGE against M2, and
   the defects the owner finds that the reviewer missed.
4. **Platform divergence (RN).** iOS-only defects found by the tester.
5. **Port cost.** Lines of code for the slice, and an estimate for the rest of the app. For Flutter,
   that's porting `@udine/shared` (about 2.5k lines) and `mobile/src/lib` (about 8k) or bridging them;
   the edge functions keep the TypeScript `@udine/shared` either way.

If (a)'s adherence is poor even with the kit and lint rule, a NativeWind/Uniwind kit is tried as a third
variant before the verdict.

## Acceptance

- [ ] M2 round 9: day control, hours and directions, allergens, loading/offline/error states and
  price are designed. The orchestrator has reviewed them by screenshot and frame strip, and the owner
  has approved them — evidence: owner
- [ ] RN build covers every listed state and motion and matches M2 — evidence: screenshot + strips,
  pr-reviewer MERGE-equivalent verdict
- [ ] RN build: the lint rule rejects a raw literal outside the kit — evidence: test
- [ ] RN TestFlight build checked by the iPhone tester against `docs/agents/ios-checklist.md` steps
  for this slice — evidence: tester report
- [ ] Flutter build covers the same states and motions on Android — evidence: golden tests + emulator
  strips, pr-reviewer verdict
- [ ] Scorecard filled in and the verdict recorded in `docs/decisions-log.md` — evidence: owner
- [ ] M2 round 10: bowl builder designed and approved — evidence: owner (doesn't block the verdict)

## Tasks

Refined by the implementation plan. Coarse order:

1. M2 round 9 design — files: `docs/design/explorations/2026-10-ui-overhaul/flows/M2/` — lanes: M2
   `test.js` — blocked by: none — PR:
2. RN bake-off build — files: `mobile/src/app/<bakeoff group>/`, `mobile/src/components/ui/`, `theme.ts`,
   `motion.ts`, lint config — lanes: mobile — blocked by: 1 — PR:
3. Write `docs/agents/ios-checklist.md` (plan Phase 1; it doesn't exist yet) with this slice's
   tester steps, then the RN TestFlight build and the tester pass — blocked by: 2 — PR:
4. Flutter bake-off build — files: `flutter/` — lanes: flutter test — blocked by: 1 (runs after 2 for
   memory) — PR:
5. Scorecard and verdict — files: `docs/decisions-log.md` — blocked by: 3, 4 — PR:
6. M2 round 10 bowl builder design — blocked by: none — PR:
