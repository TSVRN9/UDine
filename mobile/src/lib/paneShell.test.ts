import {
  clampPaneIndex,
  HOME_PANE_INDEX,
  isHorizontalSwipe,
  PANE_COUNT,
  PANE_DRAG_PX,
  paneDelta,
  paneDragPosition,
  paneIndexForSwipe,
  paneOffsetRange,
  paneVisibility,
  settleDuration,
  SWIPE_COMMIT_PX,
  SWIPE_FLING_VELOCITY,
} from "./paneShell";

describe("constants", () => {
  it("lands on Home (the middle pane) of 3 panes: Social, Home, You", () => {
    expect(PANE_COUNT).toBe(3);
    expect(HOME_PANE_INDEX).toBe(1);
  });
});

describe("clampPaneIndex", () => {
  it("clamps into [0, PANE_COUNT) when count is omitted", () => {
    expect(clampPaneIndex(-1)).toBe(0);
    expect(clampPaneIndex(0)).toBe(0);
    expect(clampPaneIndex(2)).toBe(2);
    expect(clampPaneIndex(3)).toBe(2);
  });

  // MealTabPager passes its own tab count explicitly -- a café with exactly one derived meal tab
  // must clamp everything to 0, never throw or return a fractional/negative index.
  it("clamps everything to 0 when count is 1", () => {
    expect(clampPaneIndex(-1, 1)).toBe(0);
    expect(clampPaneIndex(0, 1)).toBe(0);
    expect(clampPaneIndex(1, 1)).toBe(0);
    expect(clampPaneIndex(5, 1)).toBe(0);
  });

  it("clamps into [0, 5) for a real hall's 4 meal periods + Grab", () => {
    expect(clampPaneIndex(-1, 5)).toBe(0);
    expect(clampPaneIndex(0, 5)).toBe(0);
    expect(clampPaneIndex(4, 5)).toBe(4);
    expect(clampPaneIndex(5, 5)).toBe(4);
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
  it("snaps back (no-op) short of SWIPE_COMMIT_PX with no meaningful velocity", () => {
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

  // A fast flick used to do nothing at all if it let go before crossing SWIPE_COMMIT_PX -- the
  // single biggest source of the swipe reading as unresponsive, since a real flick gesture often
  // releases well under 60px of travel.
  describe("velocity-based fling commit", () => {
    it("commits on a fast leftward flick even far short of SWIPE_COMMIT_PX", () => {
      expect(paneIndexForSwipe(1, -10, -SWIPE_FLING_VELOCITY)).toBe(2);
    });

    it("commits on a fast rightward flick even far short of SWIPE_COMMIT_PX", () => {
      expect(paneIndexForSwipe(1, 10, SWIPE_FLING_VELOCITY)).toBe(0);
    });

    it("still snaps back on a slow drag under both the distance and velocity thresholds", () => {
      expect(paneIndexForSwipe(1, 10, 0.1)).toBe(1);
    });

    it("clamps a fling at the ends instead of wrapping", () => {
      expect(paneIndexForSwipe(0, 10, SWIPE_FLING_VELOCITY)).toBe(0);
      expect(paneIndexForSwipe(2, -10, -SWIPE_FLING_VELOCITY)).toBe(2);
    });

    it("distance-based commits are unaffected when vx is omitted (existing callers/tests)", () => {
      expect(paneIndexForSwipe(1, -SWIPE_COMMIT_PX)).toBe(2);
      expect(paneIndexForSwipe(1, SWIPE_COMMIT_PX - 1)).toBe(1);
    });
  });

  // MealTabPager's count param: a 1-tab café swipe is always inert (never leaves index 0, whatever
  // the drag distance or velocity), and a 5-tab real hall (4 meal periods + Grab) clamps at its own
  // ends instead of the 3-pane Home shell's.
  describe("count param", () => {
    it("never leaves index 0 when count is 1, distance or velocity commit alike", () => {
      expect(paneIndexForSwipe(0, -SWIPE_COMMIT_PX, 0, 1)).toBe(0);
      expect(paneIndexForSwipe(0, SWIPE_COMMIT_PX, 0, 1)).toBe(0);
      expect(paneIndexForSwipe(0, -10, -SWIPE_FLING_VELOCITY, 1)).toBe(0);
    });

    it("commits within a 5-item range and clamps at its own ends", () => {
      expect(paneIndexForSwipe(2, -SWIPE_COMMIT_PX, 0, 5)).toBe(3);
      expect(paneIndexForSwipe(2, SWIPE_COMMIT_PX, 0, 5)).toBe(1);
      expect(paneIndexForSwipe(4, -SWIPE_COMMIT_PX, 0, 5)).toBe(4);
      expect(paneIndexForSwipe(0, SWIPE_COMMIT_PX, 0, 5)).toBe(0);
    });
  });
});

// #245 item 2: the pane must track the finger continuously mid-drag, not just snap on commit.
describe("paneDragPosition", () => {
  it("stays put with no movement", () => {
    expect(paneDragPosition(1, 0)).toBe(1);
  });

  it("moves proportionally toward the next pane on a leftward drag, using PANE_DRAG_PX as the divisor", () => {
    expect(paneDragPosition(1, -PANE_DRAG_PX / 2)).toBe(1.5);
  });

  it("moves proportionally toward the previous pane on a rightward drag", () => {
    expect(paneDragPosition(1, PANE_DRAG_PX / 2)).toBe(0.5);
  });

  // The original design reused SWIPE_COMMIT_PX (60) as this divisor, so the crossfade finished
  // its ENTIRE transition by 60px of travel -- a fraction of PANE_DRAG_PX's larger, more natural
  // full-swipe distance -- and then sat visually dead for the rest of a normal-length gesture. The
  // fix is exactly that PANE_DRAG_PX is now bigger than SWIPE_COMMIT_PX, so the two constants stay
  // decoupled and don't silently collapse back into the same value.
  it("PANE_DRAG_PX is not SWIPE_COMMIT_PX -- the drag-tracking divisor and the commit threshold are deliberately different jobs", () => {
    expect(PANE_DRAG_PX).not.toBe(SWIPE_COMMIT_PX);
    expect(PANE_DRAG_PX).toBeGreaterThan(SWIPE_COMMIT_PX);
  });

  it("has not yet reached the neighboring index at SWIPE_COMMIT_PX -- there's still real distance left to cover on release, unlike the old coupled design", () => {
    expect(paneDragPosition(1, -SWIPE_COMMIT_PX)).toBeLessThan(paneIndexForSwipe(1, -SWIPE_COMMIT_PX));
  });

  it("clamps at the ends instead of dragging past the first/last pane", () => {
    expect(paneDragPosition(0, PANE_DRAG_PX)).toBe(0);
    expect(paneDragPosition(2, -PANE_DRAG_PX)).toBe(2);
  });

  // Overscroll/skip-middle-pane bug: a long/fast drag from an end pane used to be able to sweep
  // the animated position straight past its immediate neighbor (visually skipping over it) even
  // though paneIndexForSwipe never commits more than one pane away -- release then snapped back,
  // reading as "skip the middle pane, then snap back". The drag position must never lead the
  // commit target it could possibly resolve to.
  it("never drags past dragStartIndex's immediate neighbor, however far/fast the drag goes", () => {
    expect(paneDragPosition(0, -PANE_DRAG_PX * 3)).toBe(1); // not 2
    expect(paneDragPosition(2, PANE_DRAG_PX * 3)).toBe(1); // not 0
  });

  it("pins to 0 for a 1-tab café regardless of drag distance", () => {
    expect(paneDragPosition(0, 0, 1)).toBe(0);
    expect(paneDragPosition(0, -PANE_DRAG_PX / 2, 1)).toBe(0);
    expect(paneDragPosition(0, PANE_DRAG_PX * 3, 1)).toBe(0);
  });

  it("clamps at the last index (4) for a 5-item real-hall tab count", () => {
    expect(paneDragPosition(4, -PANE_DRAG_PX, 5)).toBe(4);
    expect(paneDragPosition(0, PANE_DRAG_PX, 5)).toBe(0);
  });
});

// A release right at the SWIPE_COMMIT_PX edge has very little visual distance left to animate
// (paneDragPosition already tracked most of the way there); a fast flick released early still has
// nearly the whole pane-step left. Both used to settle over the exact same flat duration -- the
// former reading as sluggish, the latter as an abrupt jump.
describe("settleDuration", () => {
  it("returns the full base duration when the whole pane-step is still left to cover", () => {
    expect(settleDuration(0, 1, 340)).toBe(340);
  });

  it("scales down proportionally when only part of the step is left (above the 40% floor)", () => {
    expect(settleDuration(0.5, 1, 340)).toBeCloseTo(340 * 0.5);
  });

  it("floors at 40% of the base duration instead of animating an already-arrived release at ~0ms", () => {
    expect(settleDuration(1, 1, 340)).toBe(340 * 0.4);
    expect(settleDuration(0.98, 1, 340)).toBe(340 * 0.4);
  });

  it("treats overshoot beyond a full pane-step the same as a full step (never exceeds the base duration)", () => {
    expect(settleDuration(-1, 1, 340)).toBe(340);
  });
});
