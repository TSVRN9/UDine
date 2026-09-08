/** Pane order for the 3-pane shell: Events ← Home → You, landing on Home. #179 replaced the
 * horizontal-ScrollView pager with the artboard's "shared-axis" transition — panes are stacked
 * (position absolute) and reposition via transform/opacity. The committed position (`activeIndex`)
 * is still an integer, but #245 drives the animated position continuously from the in-flight drag
 * (`paneDragPosition`) rather than only on commit -- see PaneStack (components/) for the animated
 * wiring; this file stays pure/testable per #134. */
export const PANE_COUNT = 3;
export const HOME_PANE_INDEX = 1;
export const YOU_PANE_INDEX = 2;

/** `count` defaults to the 3-pane Home shell -- MealTabPager passes its own tab count explicitly so
 * this same clamp works for a 4/5-tab hall or a 1-tab café without touching any existing
 * PANE_COUNT-implicit call site.
 *
 * The default is the literal `3`, NOT `PANE_COUNT` -- this function (like `paneIndexForSwipe`/
 * `paneDragPosition` below) runs as a worklet from PaneStack's gesture callbacks. The worklets
 * Babel plugin rewrites a worklet's captured outer identifiers into a `const {PANE_COUNT, ...} =
 * this.__closure` destructuring statement injected at the top of the function BODY -- but a default
 * PARAMETER expression (`= PANE_COUNT`) is evaluated in JS's own parameter scope, one level
 * *outside* the body, before that destructuring statement has run. Same rule applies to plain JS
 * (a default can't see a `const` declared later in the body either); it only bites here because the
 * plugin's rewrite is what turns `PANE_COUNT` from "a real lexical closure over module scope" (which
 * would resolve fine) into "a body-local rebinding" (which a default parameter is scoped too early
 * to see). Confirmed on-device: PaneStack.tsx briefly relied on `= PANE_COUNT` here and crashed with
 * "Property 'PANE_COUNT' doesn't exist" on the UI thread the moment a real swipe omitted the
 * argument -- see that fix's own commit. A literal needs no identifier lookup at all, in either
 * scope, so it can never repeat that crash regardless of what future call site forgets to pass
 * `count` explicitly. Keep this in sync with `PANE_COUNT` by eye; it's re-exported right above
 * specifically so a change to one is hard to miss next to the other. */
export function clampPaneIndex(index: number, count: number = 3): number {
  "worklet";
  return Math.max(0, Math.min(count - 1, index));
}

/** `d` in the artboard's own formula (`d = j - activePane`) -- drives both the pane's translateX
 * (× 36px) and, separately, the header title's (× 28px). Positive = pane is ahead of active,
 * negative = behind. */
export function paneDelta(paneIndex: number, activeIndex: number): number {
  return paneIndex - activeIndex;
}

/** `Animated.Value.interpolate`'s `outputRange` for an element whose `translateX` should track
 * `d * offset` (the artboard's own formula, see `paneDelta`) as the underlying animated position
 * sweeps through `[itemIndex - 1, itemIndex, itemIndex + 1]`. One helper so PaneStack's pane
 * offset (36px) and PaneHeader's title offset (28px) can't drift into opposite signs again --
 * they did, silently, when each interpolate() was hand-written separately (#179 review). At
 * `itemIndex - 1` (i.e. activeIndex is one behind this item, so this item's own d = +1),
 * translateX = +offset; at `itemIndex + 1` (d = -1), translateX = -offset. */
export function paneOffsetRange(offset: number): [number, number, number] {
  "worklet";
  return [offset, 0, -offset];
}

/** Symmetric "peak" shape: 1 exactly at `index`, falling linearly to `min` by one pane-step away in
 * either direction, clamped beyond -- the falloff a title's opacity or a position dot's scale/
 * opacity should follow across a swipe (same `[index-1, index, index+1]` three-point shape
 * `paneOffsetRange` models for translateX, above). A plain function, not `interpolate()`: the
 * shipped `react-native-reanimated/mock`'s own `interpolate` is a hard no-op under Jest (always
 * returns undefined), which no rendered `useAnimatedStyle` output can ever observe -- see
 * PaneHeader.test.tsx's own dot tests. `"worklet"` so it can be called directly from a UI-thread
 * `useAnimatedStyle` body. */
export function paneMorph(pos: number, index: number, min = 0): number {
  "worklet";
  const distance = Math.min(1, Math.abs(pos - index));
  return 1 - distance * (1 - min);
}

/** z-index and pointer-events are NOT part of the CSS transition (only transform/opacity are, per
 * the artboard spec) -- they flip the instant activeIndex changes. Callers must read these off the
 * plain activeIndex, never off an in-flight animated value, or a still-animating-out pane would
 * keep eating taps meant for the incoming one. */
export function paneVisibility(paneIndex: number, activeIndex: number): { zIndex: number; pointerEvents: "auto" | "none" } {
  const active = paneIndex === activeIndex;
  return { zIndex: active ? 3 : 1, pointerEvents: active ? "auto" : "none" };
}

/** A drag shorter than this is a scroll/tap, not a committed pane swipe -- release does nothing,
 * UNLESS it clears SWIPE_FLING_VELOCITY (see paneIndexForSwipe) -- a fast short flick commits too. */
export const SWIPE_COMMIT_PX = 60;

/** react-native-gesture-handler's `Gesture.Pan()` reports `velocityX`/`velocityY` in **points per
 * second** (RNGH's own type doc on `PanGestureHandlerEventPayload`, confirmed on-device below) --
 * NOT px/ms, which an earlier PanResponder-era version of this comment claimed (stale since #245's
 * migration off PanResponder to RNGH; PanResponder's `gesture.vx`/`vy` really were px/ms, but that
 * stopped being the mechanism here without this constant getting rescaled to match). A flick this
 * fast commits even under SWIPE_COMMIT_PX of travel -- without this, a quick short flick did
 * nothing at all (silently snapped back), which was the single biggest source of the swipe reading
 * as unresponsive/clunky: a real swipe gesture releases well before 60px of travel if it's moving
 * fast.
 *
 * 500 points/second, picked from on-device `emulator-5556` measurements of this exact gesture (a
 * temporary console.log probe on `e.velocityX` in PaneStack's `onEnd`, real synthetic swipes via
 * `adb shell input swipe`, not guessed): a genuinely slow, gentle drag release (400-2000ms to
 * travel a few tens of px) measured 0-33pts/s; a real short flick that clears well under
 * SWIPE_COMMIT_PX (as little as 5-22px of travel) but is unambiguously a fling measured
 * 833-3333pts/s. 500 sits roughly midway between those two observed bands -- comfortable margin
 * above the slowest deliberate drag and comfortable margin below the smallest real flick, rather
 * than hugging either edge -- so a variance in a real finger's release speed a hair either side of
 * either measured band still classifies correctly. (A `Gesture.Pan()` fast-flick-but-short synthetic
 * swipe in the 50-120px/40-60ms range measured 278-833pts/s -- a real intermediate speed, not noise.
 * Only the upper part of that band, roughly 500-833pts/s, clears SWIPE_FLING_VELOCITY and commits;
 * the lower part, 278-499pts/s, falls short of the threshold and does not, same as any other release
 * below 500.) */
export const SWIPE_FLING_VELOCITY = 500;

/** The in-flight drag position's own divisor (see paneDragPosition) -- deliberately NOT
 * SWIPE_COMMIT_PX. Reusing the 60px commit threshold as the divisor (the original #245 design)
 * meant the ENTIRE shared-axis transition -- both panes' 36px translate and the full opacity
 * crossfade -- finished by the time the finger had moved 60px, a fraction of a typical swipe's
 * actual travel distance. Past that point the drag position pins at its target
 * (paneDragPosition's own clamp) while the finger keeps moving, so a normal-length swipe popped
 * through its whole transition in the first ~1/6th of the gesture and then went visually dead for
 * the rest -- read as clunky/unresponsive even though the eventual commit was correct. This is
 * sized to a natural full-swipe travel distance instead, so the crossfade tracks the finger across
 * the whole gesture. SWIPE_COMMIT_PX keeps its own job (the commit/snap-back decision) unchanged. */
export const PANE_DRAG_PX = 140;

/** Horizontal dominance test for claiming a swipe over each pane's own vertical ScrollView -- not
 * just "any X movement" -- established pattern in this app for not reaching for a second gesture
 * library. */
export function isHorizontalSwipe(dx: number, dy: number, threshold = 10): boolean {
  "worklet";
  return Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy);
}

/** A released horizontal drag commits to the neighboring pane (±1, clamped) once it clears
 * SWIPE_COMMIT_PX, OR once its release velocity clears SWIPE_FLING_VELOCITY regardless of how far
 * it's traveled -- a fast flick commits, a slow short drag doesn't. Discrete, not proportional: the
 * artboard's transition curves are keyed to an integer activePane flip, not a drag-proportional
 * position (#179). Short of both thresholds, snaps back to the pane you started on. `vx` defaults
 * to 0 (existing distance-only callers/tests are unaffected). `count` defaults to the literal `3`,
 * not `PANE_COUNT` -- see `clampPaneIndex`'s own doc for why a worklet-called default can't safely
 * reference an outer identifier. */
export function paneIndexForSwipe(activeIndex: number, dx: number, vx = 0, count: number = 3): number {
  "worklet";
  const commits = Math.abs(dx) >= SWIPE_COMMIT_PX || Math.abs(vx) >= SWIPE_FLING_VELOCITY;
  if (!commits) return activeIndex;
  // A pure-velocity commit can fire on a drag that's barely moved yet (still well under
  // SWIPE_COMMIT_PX) -- direction has to come from whichever of dx/vx actually carries a
  // meaningful sign. dx is the more direct signal once it's non-zero (it's where the pane visually
  // is right now, via paneDragPosition); only fall back to vx's sign for the vx-only case.
  const direction = dx !== 0 ? dx : vx;
  return clampPaneIndex(activeIndex + (direction < 0 ? 1 : -1), count);
}

/** #245 item 2: the in-flight drag position, continuous rather than the discrete commit above --
 * mid-swipe the pane (and header title, see PaneStack/PaneHeader) must track the finger instead of
 * only moving once the gesture resolves. Uses PANE_DRAG_PX, not SWIPE_COMMIT_PX, as the divisor
 * (see that constant's own doc for why they used to be the same value, and why that was the root
 * cause of the swipe feeling clunky).
 *
 * Clamped to `dragStartIndex ± 1`, not the full pane range -- paneIndexForSwipe (above) never
 * commits more than one pane away from where the drag started, but a long/fast drag's raw
 * `dragStartIndex - dx / PANE_DRAG_PX` can overshoot well past that. Clamping only to
 * `[0, PANE_COUNT)` let that overshoot visually sweep the animated position straight through the
 * neighboring pane and onto the one past it, which on release then snapped back to the ±1 commit
 * target -- reading as "skip the middle pane, then snap back". Clamping to the drag's own ±1
 * neighborhood first (then still through clampPaneIndex, for the drags that start at an end pane)
 * keeps the visual sweep and the possible commit target in lockstep. `count` defaults to the
 * literal `3`, not `PANE_COUNT` -- see `clampPaneIndex`'s own doc for why a worklet-called default
 * can't safely reference an outer identifier. */
export function paneDragPosition(dragStartIndex: number, dx: number, count: number = 3): number {
  "worklet";
  const raw = dragStartIndex - dx / PANE_DRAG_PX;
  const neighborClamped = Math.max(dragStartIndex - 1, Math.min(dragStartIndex + 1, raw));
  return clampPaneIndex(neighborClamped, count);
}

/** Scales a release-settle animation's duration by how much of the pane-step is actually left to
 * cover, instead of a flat duration regardless of where the drag let go. Before this, a release
 * right at the SWIPE_COMMIT_PX edge (almost no visual distance left, since paneDragPosition has
 * already tracked the position most of the way there) and a fast flick released early (nearly the
 * whole pane-step still to animate) took the exact same 340ms/260ms -- the former read as
 * sluggish (animating a tiny remaining distance for the full duration), the latter as an abrupt
 * jump (covering most of the distance in the same window a small settle gets). Floors at 40% of
 * `baseDuration` so an already-arrived release doesn't animate at ~0ms, which reads as a glitchy
 * instant snap rather than a settle. */
export function settleDuration(from: number, to: number, baseDuration: number): number {
  "worklet";
  const remaining = Math.min(1, Math.abs(to - from));
  return Math.max(baseDuration * 0.4, baseDuration * remaining);
}

/** A tab row's active-underline fill for one tab, given the live pane position and that tab's own
 * index -- see MealTabPager.tsx's `AnimatedTabUnderline` for the visual intent this implements
 * (shrink from the leading edge while swiping away, draw in from the leading edge while settling
 * onto a tab). `d`, this tab's signed distance from the live position, is clamped to ±1 (a tab more
 * than one swipe away never shows any fill) -- `d >= 0` means the position is at or past this tab
 * (it's the one being swiped AWAY from: `right` stays 0, `left` grows 0->1 as the fill is eaten from
 * the left); `d < 0` means the position is approaching this tab from behind (it's the one being
 * swiped TOWARD: `left` stays 0, `right` shrinks 1->0 as the fill grows in from the left). One
 * formula for both directions and for a tab tap's instant snap alike -- no direction branching, no
 * separate "is this a drag or a settle or a tap" case, since it's a pure function of the live
 * position, whatever animation (or none) is currently driving that position. Returns fractions
 * (0-1), not percentage strings -- the caller formats those for style. */
export function tabUnderlineInsets(pos: number, index: number): { left: number; right: number } {
  "worklet";
  const d = Math.max(-1, Math.min(1, pos - index));
  return { left: Math.max(0, d), right: Math.max(0, -d) };
}

/** Side of one square hall card in the 2-up wrapped grid, from the grid's measured width.
 * Explicit numeric sizes only: width:"47%" + aspectRatio paints nothing on this RN/Fabric build
 * (cards reserved layout but had no pixels/taps — device pass 2026-08-19). 0 until measured. */
export function hallCardSide(gridWidth: number, gap: number): number {
  if (gridWidth <= 0) return 0;
  return Math.floor((gridWidth - gap) / 2);
}
