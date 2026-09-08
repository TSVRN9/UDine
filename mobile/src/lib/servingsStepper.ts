/** Fractional (half) servings support. The plate/log data model already accepts any number
 * (see plate.ts's PlateEntry.count, LogEntry.servings) -- this file is the only new surface,
 * shared by the hall-menu hold-and-drag add button and the plate sheet's typed-entry field. */

export const SERVINGS_STEP = 0.5;

/** Formats a serving count for display: whole numbers render bare ("2"), anything else to one
 * decimal place ("1.5") -- avoids floating-point noise from repeated float addition while still
 * showing exact half-steps and any manually typed decimal. */
export function formatServings(count: number): string {
  return Number.isInteger(count) ? String(count) : count.toFixed(1);
}

/** Parses the plate sheet's manual serving-count entry. Accepts any positive decimal -- not
 * limited to 0.5 steps, since typing exists precisely to let someone land on a value more
 * precise than the half-step drag control. Returns null for anything that isn't a finite
 * positive number, so the caller can leave the existing count in place instead of treating an
 * empty/invalid field as `setCount`'s `count <= 0` row-delete signal. */
export function parseServingsInput(text: string): number | null {
  const n = Number(text.trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/** Vertical px of drag per SERVINGS_STEP tick for the hold-and-drag add button. */
export const DRAG_STEP_PX = 26;
/** Smallest count the drag can ever *commit as an add* -- not the bottom of the drag range
 * itself, which now extends one further step down to CANCEL_SERVINGS. */
export const MIN_DRAG_SERVINGS = SERVINGS_STEP;
export const MAX_DRAG_SERVINGS = 5;

/** The drag's true floor: dragging all the way down lands here, which reads as "cancel" rather
 * than "add 0 servings" (0 is otherwise meaningless as a plate quantity). Replaces the earlier
 * separate horizontal cancel axis -- one axis, one floor value, no second gesture to discover. */
export const CANCEL_SERVINGS = 0;

/** Maps a hold-and-drag gesture's vertical translation (RNGH's translationY -- negative is up)
 * from a starting count to a snapped, clamped serving count. Dragging up increases the count,
 * matching the drag track's upward growth in the design. Clamps at CANCEL_SERVINGS on the low
 * end (not MIN_DRAG_SERVINGS) so dragging to the bottom reaches the cancel point; callers must
 * treat a result of CANCEL_SERVINGS as "commit nothing", not "add 0". */
export function servingsFromDrag(startCount: number, translationY: number): number {
  "worklet";
  const steps = Math.round(-translationY / DRAG_STEP_PX);
  const raw = startCount + steps * SERVINGS_STEP;
  return Math.min(MAX_DRAG_SERVINGS, Math.max(CANCEL_SERVINGS, raw));
}

/** Number of half-serving steps between CANCEL_SERVINGS and MAX, inclusive of both ends (10 for
 * 0-5.0, one more than the 9 addable steps since the cancel point is its own ladder rung). */
export const DRAG_STEP_COUNT = Math.round((MAX_DRAG_SERVINGS - CANCEL_SERVINGS) / SERVINGS_STEP);

/** Continuous (unrounded), clamped step index for the hold-and-drag track's scrolling tick ladder
 * (canvas: "F: inline vertical slide" -- the track's ticks are a literal, physically-spaced
 * ladder that scrolls past a fixed centered indicator, not a static map of the whole range
 * squeezed into the track's height; the full range needs far more travel than the track is
 * tall). 0 at CANCEL_SERVINGS (the cancel rung), DRAG_STEP_COUNT at MAX_DRAG_SERVINGS. Distinct
 * from servingsFromDrag's rounded result: this drives the ladder's smooth scroll offset;
 * servingsFromDrag drives the committed value and its text readout. */
export function dragContinuousIndex(startCount: number, translationY: number): number {
  "worklet";
  const startIndex = (startCount - CANCEL_SERVINGS) / SERVINGS_STEP;
  const raw = startIndex - translationY / DRAG_STEP_PX;
  return Math.min(DRAG_STEP_COUNT, Math.max(0, raw));
}

/** How close the hold-and-drag track's ladder position is to its cancel rung (index 0,
 * CANCEL_SERVINGS) -- 0 (not canceling, index >= 1) to 1 (fully at the cancel rung, index <= 0),
 * ramping continuously over the last full step so HoldSlideOverlay's cancel visuals (glyph swap,
 * caption, pill/bubble color) fade in with the drag instead of snapping. Takes `dragContinuousIndex`'s
 * own result, not a raw drag distance -- this is a read of "where did the ladder land", shared by
 * every one of HoldSlideOverlay's cancel-state style callbacks so they can't independently drift. */
export function cancelBlend(index: number): number {
  "worklet";
  return Math.min(1, Math.max(0, 1 - index));
}
