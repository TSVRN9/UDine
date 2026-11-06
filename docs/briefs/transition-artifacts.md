# Flutter: the transitions that still show artifacts

Goal: three transitions run clean on device. These are the hall card opening and closing, the tab
fade-through, and Search's rows and group headers when the query or a lens changes.

Owner report (2026-11-05, in chat): "There's a couple animations that still show some artifacts during the
transition." Asked which, they named: hall card open/close; tab fade-through; and "During search and filters,
headers and food items move strangely".

The report doesn't say what each artifact is. **Each task starts by capturing and naming it.** Record the
transition on current `main` with `app/tool/screenshot.sh --record`, extract frames, and name in the PR body the
frame numbers and what is wrong in them: a hole, a double exposure, a jump, a row that glides from the wrong
place, a header that slides when it should stay. The fix is judged against those same frames after the change.
Nothing gets fixed by eye from the code.

Prior work, so nothing gets re-briefed: `flutter-motion-fixes.md` (hall open/close: hole on close, saveLayers,
`lateStart`, title drift, Halls re-fade; its checkboxes are unticked, so check each against current main). Also #644
(no ground band on open), #651 (tabs fade content and keep the ground, M2 round 14), #648 (search rows never fade).
`flows/M2/AUDIT-transitions.md` "Unsure": tabs double-expose the two headers for about 100 ms. That was M2's
own known issue before round 14, so if it is still visible, say so rather than redesigning the fade.

## Spec

UI: M2's transitions, unchanged. Hall: the container transform (`cont` 500 ms, `contBack` 400 ms;
`app/lib/motion/container_transform.dart`, `container_math.dart`). Tabs: M2 round 14 (`CONCEPT.md` "Round 14";
`app/lib/motion/fade_through.dart`). Search: M2's row glide on a re-render (`src.html`; `app/lib/screens/search/glide.dart`).
Durations and curves come from `app/lib/theme` / `app/lib/motion`. No literal, and none of them change here. This
brief fixes rendering and timing defects. If the artifact turns out to be the design itself, the task stops and
escalates it to the owner instead of changing the motion.
Annotations: none.
States: hall open; back-button close; predictive-back swipe close, commit and cancel; first open after a cold start.
Tabs: Halls→Search, Search→You, You→Halls, and back, with the keyboard up on Search and with a hall open under Halls
(after `search-first-class` Task 1). Search: typing "chicken" one key at a time; deleting back to empty; toggling
a lens on and off with a query; a lens with no query.
Routes: `/?data=recorded&at=2026-10-08T12:41`; tap a card, then back or `--then-swipe` from x=1; `/search?q=chicken`
for the lens toggles.

Backend: none.
Residency: none.
Rationale: the owner's report names transitions, not defects, so the capture is the first deliverable of each
task. Rejected: briefing fixes from the code before frames exist (the precedent in `flutter-motion-fixes.md`, where
the cause was in the frames, not where the code suggested).

## Acceptance

- [ ] Each task's PR body names the artifact by frame number on main (before) and shows the same frames after —
  evidence: recording + frame strip
- [ ] Each fix has a regression test in `app/test/motion/` (or the screen's test) that fails on main — evidence: test (red shown)
- [ ] Durations and curves are unchanged and still checked against M2 — evidence: existing motion tests green

## Tasks

Common lanes: `cd app && flutter analyze && tool/test.sh test/motion <touched test dirs>`, recordings via
`app/tool/screenshot.sh --record` (one emulator via `emu.lock`, Gradle via `heavy.lock`).

1. **Hall card open/close.** Artifact named (emulator, `main` 7ece956d, 60 fps): a hard white bar under the station row at p of about .1 to .4, on open (`base-back-f/f-011`, `f-012`) and on close (`pb-commit-f/f-072`, `f-073`). Cause: the container surface was opaque chalk (`#mcont`) while the list fades in over p .2 to .8. Owner decision 2026-11-05: "maroon until the list fades in" (M2 round 15 §1). The ~3 px title shift before the card expands is the shared-element travel starting (frames identical until `lateStart` releases), not a defect. Files: `app/lib/motion/container_transform.dart`, `container_math.dart`, `routes.dart`,
   `app/lib/screens/halls/` — lanes: common — blocked by: none — PR:
2. **Tab fade-through.** Files: `app/lib/motion/fade_through.dart`, `app/lib/shell/shell.dart` — lanes: common —
   blocked by: `search-first-class` Task 1 (per-tab stacks change what sits under the fade) — PR:
3. **Search and lens glide.** Files: `app/lib/screens/search/glide.dart`, `search_screen.dart` — lanes: common —
   blocked by: `search-first-class` Task 3 (here-first order and Later controls change the rows that move; the
   capture has to be on that list) — PR:
