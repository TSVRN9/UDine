# Flutter: hall open/close, first opens, badge centering

Goal: opening and closing a hall is smooth and never flickers, even on a Galaxy A53. The first hall open
and the first dish sheet open after launch are as fast as later ones. Hall letters and Search's hall tiles
sit centred.

Owner report (2026-10-17, A53 internal build): "issues with halls flickering as they close", "The hall
open/close isn't completely smooth yet. (flickering, jittering). This is one of the most important
animations in the app. Also, some elements move a little strangely", "The first time opening animations
is also quite slow, and should be fast" (the first hall open and the first food detail open), "Badges
should be centered in search, and letters for dining hall badges should be centered within the badge".

Repro evidence (emulator-5556, origin/main 34fd5af1, photos off): `~/.cache/udine-scratch/ui-repro/`.
`back2.png` shows the empty Franklin band; `open2.png`, `swipe1.png` and `trk-halls.png` are strips; `tr1.txt`
and `tr3.txt` are atraces; `agg.py`, `rf.py` and `parse.py` parse them.

## Spec

UI: M2 container transform (`cont` 500 ms, `contBack` 400 ms; `app/lib/motion/container_math.dart`). The
durations and curves don't change here. This brief fixes rendering and timing defects only. The ghost-to-page
crossfade dip (the letter and title vanish near p of 0.3) is a design question that goes to M2 round 13.
Leave the crossfade math alone.
Annotations: none.
States: hall open, back-button close, predictive-back swipe close (commit and cancel), first open after a
cold start, second open; first and second dish sheet open; Search results with one-line and two-line names,
one tile and several tiles; letter patches on hall cards, the hall header, dish-sheet where-chips and Search
tiles.
Routes: `/?data=recorded&at=2026-10-08T12:41`, tap a hall card, then back or a `--then-swipe` from the left
edge. Search: type "chicken".

Backend: none.
Residency: none.
Rationale: the flicker and the jitter are defects, not design. The crossfade shape is design (M2 round 13).

## Acceptance

Task 1, hall motion and first opens:
- [ ] **No hole on close.** The hall band is visible in the same frame the card's last frame draws, for the
  back button, a committed predictive-back swipe and a cancelled one. Today `CardRoute.dispose()` calls
  `hider.show` (`app/lib/motion/routes.dart:298-299`), which runs a frame or more after the route leaves the
  tree, so the band (`halls_screen.dart:136-138`) shows as an empty hole for a frame. Reveal at
  `AnimationStatus.dismissed` or `didPop` instead. Evidence: a widget test that pumps frame by frame through
  a close and asserts the band is drawn on every frame (red on main), plus a recording with no hole frame.
- [ ] **Fewer offscreen layers during the transform.** Today each transition frame does about 28 `saveLayer`s
  and allocates 8 to 13 offscreen textures:
  - the whole-list `Opacity` + `Transform.scale` (`hall_menu.dart:541-548`);
  - about 10 header `Opacity` wrappers (`hall_header.dart:135-200`);
  - the meal tabs and station row (`meal_tabs.dart:63,97,103`);
  - two `ColorFiltered` plus a `FadeTransition` per photo (`photo.dart:43-45`).
  Drop layers where opacity is 0 or 1, fold sibling header fades into one layer, and replace the list
  `Opacity` with something that doesn't composite the whole scroll view. Keep the look within the existing
  goldens and `m2_dom*` tolerances. Evidence: a before/after layer or `saveLayer` count, from a test that
  walks the layer tree at p of 0.15, 0.5 and 0.85, plus `dumpsys SurfaceFlinger --latency` frame gaps for
  three opens and three closes, before and after.
- [ ] **The crossfade isn't skipped by slow frames.** The clock (`lateStart`, `routes.dart:19-37`) starts on
  the first tick, so a 60 ms first frame jumps p past most of the 0 to 0.3 crossfade. Start the clock only
  after the first transition frame has rasterised (e.g. `SchedulerBinding.addPostFrameCallback` +
  `endOfFrame`), so the first visible frame is p of 0. Evidence: a test with a fake slow first frame.
- [ ] **First open as fast as later ones.** The first hall open spends about 300 ms in `glGenFramebuffers`
  for the offscreen targets, and the layer cut above shrinks that. If the first open still drops frames
  that later ones don't, warm the path at launch, e.g. one offscreen frame of a card route after the first
  idle. Evidence: latency for the first open after a cold start against the second open, on the emulator
  and on the A53.
- [ ] **No title drift after landing.** The title nudges about 10 dp after the container finishes
  (`_measure` post-frame `setState` for `_drop`, `hall_header.dart:~90`, and the busy row's `AnimatedSize`,
  `~215-225`). Measure before the first transition frame, or lay out without a post-frame pass. Evidence: a
  test asserting the title's rect is unchanged from the last transition frame to 300 ms later.
- [ ] **First dish sheet open is smooth.** `openDishSheet` builds `WhereBook` synchronously
  (`dish_sheet.dart:42`). That prefetches every hall's menus for 2 days and every café, on the UI isolate
  (`where_book.dart:26-50`), while the sheet slides in: about 1.1 s of Dart tasks and GCs on first open.
  Start it after the sheet settles, and parse off the UI isolate (`compute`/`Isolate.run`) if the parse is
  the cost. The where line may fill in after the sheet lands; it must not move the sheet's rest height.
  Evidence: latency for the first and second open; a test that the sheet's first frames don't wait on
  `WhereBook`.
- [ ] **Halls doesn't re-fade on tab return.** `Band.fade`/`_arrive` re-runs when Halls is re-shown, so the
  status and busy lines fade in 4 to 8 frames after the names (`trk-halls.png`). Fade only on first data
  arrival. Evidence: a test.

Task 2, centering (owner decision; this moves Search off M2's 2.5 dp offset):
- [ ] **Search hall tiles** centre vertically on the row's meta line ("206 cal 11.8g protein"), not the
  lane's bottom. A group of several tiles centres under the "+" as one group, not growing leftward from the
  right edge. Update `m2_dom_search*` expectations with a comment citing this brief. Evidence: an updated
  measurement test, red on main, plus screenshots of one-line and two-line rows with one and several tiles.
- [ ] **Letter patches** centre the cap glyph, not the line box, everywhere a hall letter is drawn: the
  hall-card band letter, the hall header, dish-sheet where-chips (`ui/badge.dart:78`, about 0.7 dp low) and
  Search tiles (`ui/hall_tags.dart:17-24`). Use one shared rule, e.g. a `TextHeightBehavior`/`StrutStyle`
  or a cap-height offset from Oswald's metrics, applied in one place. Evidence: a pixel test that renders
  each letter (W F H B and a café letter) and asserts glyph ink is centred within 0.25 dp both ways, plus
  3x crops.

## Tasks

1. Hall motion and first opens (all Task 1 criteria) — files: `app/lib/motion/`, `app/lib/screens/halls/`,
   `app/lib/screens/hall/`, `app/lib/ui/photo.dart`, `app/lib/sheets/dish_sheet.dart` (or wherever
   `openDishSheet` lives), `where_book.dart` — lanes: flutter, device (emulator-5556; the A53 once it's
   free) — blocked by: none — PR:
2. Centering (all Task 2 criteria) — files: `app/lib/ui/hall_tags.dart`, `app/lib/ui/badge.dart`, the
   Search row, theme text kinds — lanes: flutter, emulator capture — blocked by: none — PR:
