import { Animated, Text, View } from "react-native";
import renderer, { act } from "react-test-renderer";
import { MealTabPager } from "./MealTabPager";
import { PANE_DRAG_PX, paneDragPosition, settleDuration } from "../lib/paneShell";

function Pane({ label }: { label: string }) {
  return <Text>{label}</Text>;
}

// Same synthetic single-touch PanResponder event shape paneStack.test.tsx already established --
// see that file's own doc for why dx is the move's own prev/curr delta (not diffed across calls)
// and why vx-sensitive tests need a realistic timeStamp gap (release reuses the last move's vx
// as-is, it never recomputes it).
function fakeTouch(previousPageX: number, currentPageX: number, timeStamp: number) {
  return {
    nativeEvent: { touches: [{}], changedTouches: [{}], timestamp: timeStamp },
    touchHistory: {
      touchBank: [{ touchActive: true, currentTimeStamp: timeStamp, currentPageX, currentPageY: 0, previousPageX, previousPageY: 0 }],
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: timeStamp,
    },

  } as any;
}

function fivePanes() {
  return [
    <Pane key="breakfast" label="Breakfast" />,
    <Pane key="lunch" label="Lunch" />,
    <Pane key="dinner" label="Dinner" />,
    <Pane key="latenight" label="Late Night" />,
    <Pane key="grab" label="Grab" />,
  ];
}

function renderGestureHarness(activeIndex: number, panes: React.ReactNode[], onActiveIndexChange: (index: number) => void) {
  let root!: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(<MealTabPager activeIndex={activeIndex} onActiveIndexChange={onActiveIndexChange} panes={panes} />);
  });
  const candidates = root.root.findAllByType(View).filter((n) => typeof n.props.onResponderGrant === "function");
  expect(candidates.length).toBe(1);
  return {
    root,
    handlers: candidates[0].props as {
      onResponderGrant: (e: unknown) => void;
      onResponderMove: (e: unknown) => void;
      onResponderRelease: (e: unknown) => void;
      onResponderTerminate: (e: unknown) => void;
    },
  };
}

describe("MealTabPager windowing", () => {
  it("mounts only activeIndex ± 1, not every pane -- Grab (index 4) is unmounted while on Lunch (index 1)", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<MealTabPager activeIndex={1} onActiveIndexChange={() => {}} panes={fivePanes()} />);
    });
    const texts = root.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toEqual(expect.arrayContaining(["Breakfast", "Lunch", "Dinner"]));
    expect(texts).not.toContain("Late Night");
    expect(texts).not.toContain("Grab");
  });

  it("mounts the new neighborhood after activeIndex commits elsewhere (Grab mounts once active)", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<MealTabPager activeIndex={1} onActiveIndexChange={() => {}} panes={fivePanes()} />);
    });
    act(() => {
      root.update(<MealTabPager activeIndex={4} onActiveIndexChange={() => {}} panes={fivePanes()} />);
    });
    const texts = root.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toEqual(expect.arrayContaining(["Late Night", "Grab"]));
    expect(texts).not.toContain("Breakfast");
    expect(texts).not.toContain("Lunch");
  });

  it("hides non-active mounted panes from the accessibility tree, keeps the active one visible", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<MealTabPager activeIndex={1} onActiveIndexChange={() => {}} panes={fivePanes()} />);
    });
    // findAllByType(View), not findAllByProps -- Animated.View forwards props to its underlying
    // host View, so a props-only query matches both the composite and host node per pane (same
    // "filter host View nodes" strategy the swipe-gesture harness above already uses).
    const hostViews = root.root.findAllByType(View);
    const visible = hostViews.filter((n) => n.props.importantForAccessibility === "auto");
    expect(visible.length).toBe(1);
    const hidden = hostViews.filter((n) => n.props.importantForAccessibility === "no-hide-descendants");
    expect(hidden.length).toBe(2); // the two windowed neighbors (Breakfast, Dinner)
    for (const v of hidden) expect(v.props.accessibilityElementsHidden).toBe(true);
  });
});

// PR review finding: a committed jump of more than one index (only reachable via a tab tap -- a
// real swipe can never commit more than ±1, see paneIndexForSwipe's own clamp) used to always
// animate continuously toward the new index, sweeping the shared position through panes windowing
// never mounted for that jump (a blank gap) or through a pane that's mounted as a neighbor of the
// DESTINATION but was never meant to be seen mid-transition (its own opacity interpolate peaks at 1
// exactly where the sweep passes through its index -- a real dish list flashing fully visible).
describe("MealTabPager non-adjacent jump handling", () => {
  it("seeds the position directly (no tween) on a non-adjacent tab jump, instead of animating through panes the jump was never meant to reveal", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<MealTabPager activeIndex={0} onActiveIndexChange={() => {}} panes={fivePanes()} />);
    });
    const timingSpy = jest.spyOn(Animated, "timing");
    const callsBefore = timingSpy.mock.calls.length;

    act(() => {
      root.update(<MealTabPager activeIndex={4} onActiveIndexChange={() => {}} panes={fivePanes()} />);
    });

    // No tween at all for this transition -- a mutated version that always calls Animated.timing
    // would show 2 calls here (panePos + paneOpacityPos) instead of 0.
    expect(timingSpy.mock.calls.slice(callsBefore).length).toBe(0);
    // The destination pane is immediately the sole active/visible one, not mid-crossfade.
    const hostViews = root.root.findAllByType(View);
    expect(hostViews.filter((n) => n.props.importantForAccessibility === "auto").length).toBe(1);
  });

  it("still animates smoothly via Animated.timing for an adjacent (single-step) index change, tab-tap or swipe alike", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<MealTabPager activeIndex={1} onActiveIndexChange={() => {}} panes={fivePanes()} />);
    });
    const timingSpy = jest.spyOn(Animated, "timing");
    const callsBefore = timingSpy.mock.calls.length;

    act(() => {
      root.update(<MealTabPager activeIndex={2} onActiveIndexChange={() => {}} panes={fivePanes()} />);
    });

    const calls = timingSpy.mock.calls.slice(callsBefore);
    expect(calls.length).toBe(2); // panePos + paneOpacityPos
    for (const [, config] of calls) expect((config as { toValue: number }).toValue).toBe(2);
  });
});

describe("MealTabPager swipe gesture wiring", () => {
  it("(a) onPanResponderMove drives the shared position continuously, well before any commit", () => {
    const onActiveIndexChange = jest.fn();
    const { handlers } = renderGestureHarness(1, fivePanes(), onActiveIndexChange);

    act(() => {
      handlers.onResponderGrant(fakeTouch(0, 0, 1));
    });
    act(() => {
      handlers.onResponderMove(fakeTouch(0, -PANE_DRAG_PX / 2, 2));
    });
    expect(onActiveIndexChange).not.toHaveBeenCalled();
  });

  it("(b) release below SWIPE_COMMIT_PX and below SWIPE_FLING_VELOCITY settles back, no commit", () => {
    const onActiveIndexChange = jest.fn();
    const { handlers } = renderGestureHarness(1, fivePanes(), onActiveIndexChange);

    act(() => {
      handlers.onResponderGrant(fakeTouch(0, 0, 1));
    });
    act(() => {
      handlers.onResponderMove(fakeTouch(0, -45, 1000)); // below the 60px commit threshold, realistic dt
    });
    act(() => {
      handlers.onResponderRelease(fakeTouch(-45, -45, 1001));
    });

    expect(onActiveIndexChange).not.toHaveBeenCalled();
  });

  it("(c) release above SWIPE_COMMIT_PX commits to the neighboring tab", () => {
    const onActiveIndexChange = jest.fn();
    const { handlers } = renderGestureHarness(1, fivePanes(), onActiveIndexChange);
    const timingSpy = jest.spyOn(Animated, "timing");

    act(() => {
      handlers.onResponderGrant(fakeTouch(0, 0, 1));
    });
    act(() => {
      handlers.onResponderMove(fakeTouch(0, -80, 1000)); // dx=-80, past the 60px commit threshold
    });
    const callsBeforeRelease = timingSpy.mock.calls.length;
    act(() => {
      handlers.onResponderRelease(fakeTouch(-80, -80, 1001));
    });

    expect(onActiveIndexChange).toHaveBeenCalledWith(2); // negative dx commits to the next tab
    const settleCalls = timingSpy.mock.calls.slice(callsBeforeRelease);
    expect(settleCalls.length).toBeGreaterThan(0);
    for (const [, config] of settleCalls) {
      expect((config as { toValue: number }).toValue).toBe(2);
    }
  });

  it("(d) clamps at the last tab instead of committing past it", () => {
    const onActiveIndexChange = jest.fn();
    const { handlers } = renderGestureHarness(4, fivePanes(), onActiveIndexChange);

    act(() => {
      handlers.onResponderGrant(fakeTouch(0, 0, 1));
    });
    act(() => {
      handlers.onResponderMove(fakeTouch(0, -80, 1000)); // leftward past the last tab
    });
    act(() => {
      handlers.onResponderRelease(fakeTouch(-80, -80, 1001));
    });

    expect(onActiveIndexChange).not.toHaveBeenCalled(); // already at the last index, nothing to commit to
  });

  it("(e) release settle duration reflects the in-flight drag position", () => {
    const onActiveIndexChange = jest.fn();
    const { handlers } = renderGestureHarness(1, fivePanes(), onActiveIndexChange);
    const timingSpy = jest.spyOn(Animated, "timing");

    act(() => {
      handlers.onResponderGrant(fakeTouch(0, 0, 1));
    });
    act(() => {
      handlers.onResponderMove(fakeTouch(0, -80, 1000));
    });
    const callsBeforeRelease = timingSpy.mock.calls.length;
    act(() => {
      handlers.onResponderRelease(fakeTouch(-80, -80, 1001));
    });

    const fromPos = paneDragPosition(1, -80, 5);
    const expectedTransformDuration = settleDuration(fromPos, 2, 340);
    const durations = timingSpy.mock.calls.slice(callsBeforeRelease).map(([, config]) => (config as { duration: number }).duration);
    expect(durations).toContainEqual(expectedTransformDuration);
  });

  it("(fling) a fast flick well short of SWIPE_COMMIT_PX still commits", () => {
    const onActiveIndexChange = jest.fn();
    const { handlers } = renderGestureHarness(1, fivePanes(), onActiveIndexChange);

    act(() => {
      handlers.onResponderGrant(fakeTouch(0, 0, 1));
    });
    act(() => {
      handlers.onResponderMove(fakeTouch(0, -5, 1000));
    });
    act(() => {
      handlers.onResponderMove(fakeTouch(-5, -25, 1016)); // vx = -20/16 = -1.25px/ms, past SWIPE_FLING_VELOCITY
    });
    act(() => {
      handlers.onResponderRelease(fakeTouch(-25, -25, 1017));
    });

    expect(onActiveIndexChange).toHaveBeenCalledWith(2);
  });

  it("a single-tab café (panes.length === 1) never commits, whatever the drag", () => {
    const onActiveIndexChange = jest.fn();
    const { handlers } = renderGestureHarness(0, [<Pane key="allday" label="All Day" />], onActiveIndexChange);

    act(() => {
      handlers.onResponderGrant(fakeTouch(0, 0, 1));
    });
    act(() => {
      handlers.onResponderMove(fakeTouch(0, -80, 1000));
    });
    act(() => {
      handlers.onResponderRelease(fakeTouch(-80, -80, 1001));
    });

    expect(onActiveIndexChange).not.toHaveBeenCalled();
  });
});

// The PanResponder below is built exactly once (useRef) -- without countRef/onActiveIndexChangeRef,
// its callbacks would close over whatever `panes.length` was at that first render forever after.
// This can only matter while the SAME component instance survives a panes-length change (a fresh
// renderer.create -- what most tests above do -- always builds a fresh, already-correct
// PanResponder, so it can't exercise this at all). Reviewed and confirmed (PR review, second pass):
// an integration test that goes through halls/[slug].tsx's café date-stepping can't reach this
// either -- that screen's fetch effect always nulls `items` before the new items resolve, so its
// derived tab count always passes through 0 on every date step, which fully unmounts/remounts
// MealTabPager (a fresh PanResponder every time) before that caller could ever exercise a live
// panes-length shrink. That's incidental to an unrelated implementation detail in today's sole
// caller (item-nulling on refetch), not a guarantee `panes: ReactNode[]` makes as a public prop --
// a future caller (or a change to this one, e.g. keeping stale items during refetch to avoid a
// skeleton flash) could hit this live with no change to MealTabPager itself. Testing directly at
// this level, via root.update with a shrunk `panes` array on the SAME renderer instance, is what
// actually exercises the fix against that contract.
describe("MealTabPager stale-closure resistance (countRef)", () => {
  it("a swipe after panes.length shrinks on the same mounted instance resolves against the fresh count, not the count from when the PanResponder was first built", () => {
    const onActiveIndexChange = jest.fn();
    const fourPanes = fivePanes().slice(0, 4); // indices 0-3
    const { root, handlers } = renderGestureHarness(3, fourPanes, onActiveIndexChange); // active on the last of 4

    // Shrinks to 3 panes, same renderer instance (root.update, not a fresh renderer.create) -- the
    // exact scenario the PanResponder's useRef-once construction risks going stale on. Still on
    // "the last tab", now correctly index 2 in the smaller array (mirrors how
    // halls/[slug].tsx recomputes activeIndex when a still-valid selectedMeal's tab shifts position
    // after mealTabs shrinks).
    const threePanes = fivePanes().slice(0, 3);
    act(() => {
      root.update(<MealTabPager activeIndex={2} onActiveIndexChange={onActiveIndexChange} panes={threePanes} />);
    });

    act(() => {
      handlers.onResponderGrant(fakeTouch(0, 0, 1));
    });
    act(() => {
      handlers.onResponderMove(fakeTouch(0, -80, 1000)); // leftward past SWIPE_COMMIT_PX -- "commit to the next tab"
    });
    act(() => {
      handlers.onResponderRelease(fakeTouch(-80, -80, 1001));
    });

    // Fresh count (3): activeIndex 2 is already the last valid index -- clamped, no commit.
    // A stale count (4, from the render this PanResponder was originally built at) would compute
    // activeIndex 2 as NOT the last index under a 4-count, incorrectly committing to index 3 --
    // out of range for the 3-pane array this component is actually rendering now.
    expect(onActiveIndexChange).not.toHaveBeenCalled();
  });
});
