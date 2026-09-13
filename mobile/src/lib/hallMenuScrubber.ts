/** Pure helpers for halls/[slug].tsx's station scroll-indicator (the vertical per-station track
 * beside the dish list -- drag to jump between stations, highlight tracks normal scroll). No
 * design-canvas artboard exists for this component (owner's verbal ask only, see the PR body) --
 * kept pure/testable instead, same style as hallMenuBadgeLayout.ts's shouldTuckBadges. */
import type { ViewToken } from "react-native";
import type { MenuSection } from "./hallMenuSections";

/** Maps a touch's Y offset within the track (0 at its top) to a station index, clamped to
 * [0, stationCount-1]. `"worklet"` -- called directly from the scrub gesture's UI-thread
 * callbacks (StationScrubber.tsx), not just from JS/tests. `Math.floor`, not `.round`: the touch
 * needs to be strictly INSIDE a segment's band to select it (a round would put the boundary
 * between two segments at their shared midpoint instead of at the segment edge the user actually
 * sees drawn). */
export function stationIndexForOffset(offsetY: number, trackHeight: number, stationCount: number): number {
  "worklet";
  if (stationCount <= 0 || trackHeight <= 0) return 0;
  const raw = Math.floor((offsetY / trackHeight) * stationCount);
  return Math.min(stationCount - 1, Math.max(0, raw));
}

/** The topmost currently-viewable item's section index within `sections` -- what the track's
 * normal-scroll highlight follows. `sections` must be the SAME array reference the SectionList
 * reporting `viewableItems` was given as its own `sections` prop -- RN echoes back that exact
 * object per viewable item, never a copy, so identity (not deep-equality) is what `indexOf` below
 * relies on. Returns null when nothing's viewable yet (an empty/loading list) or the reported
 * section isn't one of `sections` (a stale event from a just-swapped list). */
export function topViewableSectionIndex(viewableItems: ViewToken[], sections: MenuSection[]): number | null {
  const first = viewableItems.find((v) => v.isViewable);
  if (!first) return null;
  const idx = sections.indexOf(first.section as MenuSection);
  return idx >= 0 ? idx : null;
}

/** One segment's height in an N-segment track of `trackHeight` with `gap` between segments --
 * shared by StationScrubber.tsx's static segment render and its animated highlight's position
 * math, so the two can never independently drift out of alignment. Trivial arithmetic, no branch
 * worth a dedicated test beyond stationIndexForOffset's own (same division). `"worklet"` -- read
 * from useAnimatedStyle. */
export function segmentHeightFor(trackHeight: number, stationCount: number, gap: number): number {
  "worklet";
  if (stationCount <= 0) return 0;
  return Math.max(0, (trackHeight - (stationCount - 1) * gap) / stationCount);
}

/** Top offset of segment `index` in that same track. `"worklet"`. */
export function segmentTopFor(index: number, segmentHeight: number, gap: number): number {
  "worklet";
  return index * (segmentHeight + gap);
}
