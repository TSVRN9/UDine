/** Pane order for the 3-pane swipe shell: Social ← Home → You, landing on Home. */
export const PANE_COUNT = 3;
export const HOME_PANE_INDEX = 1;

/** Maps a horizontal ScrollView's scroll offset to the nearest pane index, clamped into range —
 * Android momentum scroll can overshoot past the last pane's offset before settling. */
export function paneIndexForScrollOffset(offsetX: number, paneWidth: number): number {
  if (paneWidth <= 0) return 0;
  const index = Math.round(offsetX / paneWidth);
  return Math.max(0, Math.min(PANE_COUNT - 1, index));
}

/** Scroll offset to land on HOME_PANE_INDEX, once `paneWidth` is known from onLayout. Contentless
 * (0) before layout — callers should not scroll until paneWidth > 0. */
export function initialPaneOffset(paneWidth: number): number {
  if (paneWidth <= 0) return 0;
  return paneWidth * HOME_PANE_INDEX;
}

/** Which of the PANE_COUNT header dots is active, in pane order. */
export function paneDots(activeIndex: number): boolean[] {
  return Array.from({ length: PANE_COUNT }, (_, i) => i === activeIndex);
}

/** True exactly once: the pager's native content has reached its full PANE_COUNT-panes width and
 * the initial land-on-Home scroll hasn't happened yet. Keyed to onContentSizeChange, NOT to the
 * commit that sizes the panes — scrolling in that same commit races the native contentSize update
 * and clamps to x=0, stranding the user on Social (device pass 2026-08-19, 7/7 cold launches). */
export function shouldLandOnHome(contentWidth: number, paneWidth: number, alreadyLanded: boolean): boolean {
  if (alreadyLanded || paneWidth <= 0) return false;
  return contentWidth >= paneWidth * PANE_COUNT;
}

/** Side of one square hall card in the 2-up wrapped grid, from the grid's measured width.
 * Explicit numeric sizes only: width:"47%" + aspectRatio paints nothing on this RN/Fabric build
 * (cards reserved layout but had no pixels/taps — device pass 2026-08-19). 0 until measured. */
export function hallCardSide(gridWidth: number, gap: number): number {
  if (gridWidth <= 0) return 0;
  return Math.floor((gridWidth - gap) / 2);
}
