/** Pane order for the 3-pane shell: Social ← Home → You, landing on Home. #179 replaced the
 * horizontal-ScrollView pager with the artboard's "shared-axis" transition — panes are stacked
 * (position absolute) and reposition via transform/opacity keyed off an integer activePane index,
 * not a continuous scroll offset. See PaneStack (components/) for the animated wiring; this file
 * stays pure/testable per #134. */
export const PANE_COUNT = 3;
export const HOME_PANE_INDEX = 1;

export function clampPaneIndex(index: number): number {
  return Math.max(0, Math.min(PANE_COUNT - 1, index));
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
  return [offset, 0, -offset];
}

/** z-index and pointer-events are NOT part of the CSS transition (only transform/opacity are, per
 * the artboard spec) -- they flip the instant activeIndex changes. Callers must read these off the
 * plain activeIndex, never off an in-flight animated value, or a still-animating-out pane would
 * keep eating taps meant for the incoming one. */
export function paneVisibility(paneIndex: number, activeIndex: number): { zIndex: number; pointerEvents: "auto" | "none" } {
  const active = paneIndex === activeIndex;
  return { zIndex: active ? 3 : 1, pointerEvents: active ? "auto" : "none" };
}

/** Which of the PANE_COUNT header dots is active, in pane order. */
export function paneDots(activeIndex: number): boolean[] {
  return Array.from({ length: PANE_COUNT }, (_, i) => i === activeIndex);
}

/** A drag shorter than this is a scroll/tap, not a committed pane swipe -- release does nothing. */
export const SWIPE_COMMIT_PX = 60;

/** Horizontal dominance test for claiming a swipe over each pane's own vertical ScrollView -- not
 * just "any X movement" (see SocialPane's own PanResponder for the established pattern of this
 * app not reaching for a second gesture library). */
export function isHorizontalSwipe(dx: number, dy: number, threshold = 10): boolean {
  return Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy);
}

/** A released horizontal drag commits to the neighboring pane (±1, clamped) once it clears
 * SWIPE_COMMIT_PX -- discrete, not proportional: the artboard's transition curves are keyed to an
 * integer activePane flip, not a drag-proportional position (#179). Short of that, snaps back to
 * the pane you started on. */
export function paneIndexForSwipe(activeIndex: number, dx: number): number {
  if (Math.abs(dx) < SWIPE_COMMIT_PX) return activeIndex;
  return clampPaneIndex(activeIndex + (dx < 0 ? 1 : -1));
}

/** Side of one square hall card in the 2-up wrapped grid, from the grid's measured width.
 * Explicit numeric sizes only: width:"47%" + aspectRatio paints nothing on this RN/Fabric build
 * (cards reserved layout but had no pixels/taps — device pass 2026-08-19). 0 until measured. */
export function hallCardSide(gridWidth: number, gap: number): number {
  if (gridWidth <= 0) return 0;
  return Math.floor((gridWidth - gap) / 2);
}
