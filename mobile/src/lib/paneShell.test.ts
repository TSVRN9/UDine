import {
  clampPaneIndex,
  HOME_PANE_INDEX,
  isHorizontalSwipe,
  PANE_COUNT,
  paneDelta,
  paneIndexForSwipe,
  paneOffsetRange,
  paneVisibility,
  SWIPE_COMMIT_PX,
} from "./paneShell";

describe("constants", () => {
  it("lands on Home (the middle pane) of 3 panes: Social, Home, You", () => {
    expect(PANE_COUNT).toBe(3);
    expect(HOME_PANE_INDEX).toBe(1);
  });
});

describe("clampPaneIndex", () => {
  it("clamps into [0, PANE_COUNT)", () => {
    expect(clampPaneIndex(-1)).toBe(0);
    expect(clampPaneIndex(0)).toBe(0);
    expect(clampPaneIndex(2)).toBe(2);
    expect(clampPaneIndex(3)).toBe(2);
  });
});

describe("paneDelta", () => {
  it("is the artboard's d = j - activePane", () => {
    expect(paneDelta(0, 1)).toBe(-1);
    expect(paneDelta(1, 1)).toBe(0);
    expect(paneDelta(2, 1)).toBe(1);
    expect(paneDelta(2, 0)).toBe(2);
  });
});

describe("paneOffsetRange", () => {
  // #179 review: PaneStack's pane transform and PaneHeader's title transform both key off the
  // same `d = j - activePane` formula, at two different offsets (36px, 28px). PaneHeader's own
  // interpolate() was hand-written with the outputRange sign flipped -- the title crossfaded in
  // the opposite direction from the pane content it labels. One shared helper, consumed by both
  // call sites, is what keeps that from drifting apart again silently.
  it("matches translateX(d * offset) at the interpolation's three input points", () => {
    // At inputPos === itemIndex - 1, this item's own d = itemIndex - inputPos = +1 -> +offset.
    // At inputPos === itemIndex + 1, d = -1 -> -offset. At inputPos === itemIndex, d = 0 -> 0.
    expect(paneOffsetRange(36)).toEqual([36, 0, -36]);
    expect(paneOffsetRange(28)).toEqual([28, 0, -28]);
  });
});

describe("paneVisibility", () => {
  it("gives the active pane the top z-index and live touches", () => {
    expect(paneVisibility(1, 1)).toEqual({ zIndex: 3, pointerEvents: "auto" });
  });

  it("keeps inactive panes below and untappable", () => {
    expect(paneVisibility(0, 1)).toEqual({ zIndex: 1, pointerEvents: "none" });
    expect(paneVisibility(2, 1)).toEqual({ zIndex: 1, pointerEvents: "none" });
  });
});

describe("isHorizontalSwipe", () => {
  it("claims a drag that's mostly horizontal and past the threshold", () => {
    expect(isHorizontalSwipe(20, 2)).toBe(true);
  });

  it("does not claim a mostly-vertical drag", () => {
    expect(isHorizontalSwipe(5, 20)).toBe(false);
  });

  it("does not claim a drag under the threshold, even if purely horizontal", () => {
    expect(isHorizontalSwipe(5, 0)).toBe(false);
  });
});

describe("paneIndexForSwipe", () => {
  it("snaps back (no-op) short of SWIPE_COMMIT_PX", () => {
    expect(paneIndexForSwipe(1, SWIPE_COMMIT_PX - 1)).toBe(1);
    expect(paneIndexForSwipe(1, -(SWIPE_COMMIT_PX - 1))).toBe(1);
  });

  it("commits to the next pane on a leftward drag past the threshold", () => {
    expect(paneIndexForSwipe(1, -SWIPE_COMMIT_PX)).toBe(2);
  });

  it("commits to the previous pane on a rightward drag past the threshold", () => {
    expect(paneIndexForSwipe(1, SWIPE_COMMIT_PX)).toBe(0);
  });

  it("clamps at the ends instead of wrapping", () => {
    expect(paneIndexForSwipe(0, SWIPE_COMMIT_PX)).toBe(0);
    expect(paneIndexForSwipe(2, -SWIPE_COMMIT_PX)).toBe(2);
  });
});
