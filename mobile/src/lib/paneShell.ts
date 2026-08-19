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
