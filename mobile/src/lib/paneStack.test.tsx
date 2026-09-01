import { useState } from "react";
import { Animated, Text, View } from "react-native";
import renderer, { act } from "react-test-renderer";

import { PaneStack } from "../components/PaneStack";
import { PANE_DRAG_PX, paneDragPosition, settleDuration } from "./paneShell";

// Jest hoists jest.mock() above imports and only allows referencing out-of-scope variables whose
// name starts with "mock" inside the factory -- hence the prefix on all three.
const mockMountCount = { current: 0 };
let mockLatestOnSelectPane: ((index: number) => void) | null = null;
let mockLatestActiveIndex = -1;
// #245: captured so gesture tests can read the SAME Animated.Value instances PaneStack drives via
// onPanResponderMove/settlePosition -- proves the wiring reaches PaneHeader's shared title tracking,
// not just the pure paneDragPosition helper.
let mockLatestTitlePos: Animated.Value | null = null;
let mockLatestTitleOpacityPos: Animated.Value | null = null;

// #179: PaneHeader must mount exactly once and stay mounted across every pane switch -- a remount
// would restart its internal Animated.Values (title crossfade, dot morph) and desync them from the
// pane transition they're meant to track. Mocked here (not rendered for real) so the assertion is
// about PaneStack's own composition -- header once, outside the per-pane loop -- not about
// PaneHeader's internals, which PaneHeader.tsx's own concerns cover.
jest.mock("../components/PaneHeader", () => {
  const React = require("react");
  return {
    PaneHeader: (props: {
      activeIndex: number;
      onSelectPane: (index: number) => void;
      titlePos?: Animated.Value;
      titleOpacityPos?: Animated.Value;
    }) => {
      mockLatestOnSelectPane = props.onSelectPane;
      mockLatestActiveIndex = props.activeIndex;
      mockLatestTitlePos = props.titlePos ?? null;
      mockLatestTitleOpacityPos = props.titleOpacityPos ?? null;
      React.useEffect(() => {
        mockMountCount.current += 1;
      }, []);
      return null;
    },
  };
});

function Pane({ label }: { label: string }) {
  return <Text>{label}</Text>;
}

function Harness() {
  const [index, setIndex] = useState(1);
  return (
    <PaneStack
      activeIndex={index}
      onActiveIndexChange={setIndex}
      topInset={0}
      panes={[<Pane key="s" label="Social" />, <Pane key="h" label="Home" />, <Pane key="y" label="You" />]}
    />
  );
}

beforeEach(() => {
  mockMountCount.current = 0;
  mockLatestOnSelectPane = null;
  mockLatestActiveIndex = -1;
  mockLatestTitlePos = null;
  mockLatestTitleOpacityPos = null;
});

// A single-touch PanResponder move/grant event. `dx` for a move is `currentPageX - previousPageX`
// of the SAME event (RN's PanResponder accumulates gestureState.dx from that per-event delta, not
// from diffing across separate calls) -- so a move's own prev/curr pair IS the gesture's step, and
// grant's pageX value is irrelevant (PaneStack's onPanResponderGrant reads no gesture fields).
//
// `gesture.vx` (read by PaneStack for the fling-commit path) is computed by RN's PanResponder as
// `(step's dx) / (this move's timeStamp - the PREVIOUS move's timeStamp)` -- and a release event
// does NOT recompute it, it just reuses whatever vx the last onResponderMove call left in the
// shared gestureState (see PanResponder.js's onResponderRelease, which never calls
// _updateGestureStateOnMove). So `timeStamp` isn't just event ordering here: for any test whose
// release cares about vx, the LAST move's timeStamp gap needs to be a plausible real duration (RN
// frames are ~16ms) relative to its own dx, or the synthetic vx comes out absurdly large/small.
// Distance-only tests (checking dx-driven position/commit, not vx) can keep using small sequential
// values -- only vx-sensitive ones need realistic gaps.
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

// `__getValue()` is RN's own internal-but-stable way to read an Animated.Value synchronously
// (used by every native driver); it's just not in the public .d.ts, hence the cast.
function readAnimatedValue(value: Animated.Value): number {
  return (value as unknown as { __getValue(): number }).__getValue();
}

describe("PaneStack swipe gesture wiring (#245 item 2)", () => {
  // Renders with activeIndex=1 (Home) and returns the responder handlers spread onto the root
  // View by `{...panResponder.panHandlers}` -- same lookup strategy SocialPane.test.tsx uses for
  // its own PanResponder-driven gesture (find by the onResponderGrant prop RN actually attaches,
  // not by style/testID).
  function renderGestureHarness(onActiveIndexChange: (index: number) => void) {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <PaneStack
          activeIndex={1}
          onActiveIndexChange={onActiveIndexChange}
          topInset={0}
          panes={[<Pane key="s" label="Social" />, <Pane key="h" label="Home" />, <Pane key="y" label="You" />]}
        />,
      );
    });
    const candidates = root.root.findAllByType(View).filter((n) => typeof n.props.onResponderGrant === "function");
    expect(candidates.length).toBe(1);
    return candidates[0].props as {
      onResponderGrant: (e: unknown) => void;
      onResponderMove: (e: unknown) => void;
      onResponderRelease: (e: unknown) => void;
      onResponderTerminate: (e: unknown) => void;
    };
  }

  it("(b) onPanResponderGrant stops any in-flight settle animation before a new drag starts", () => {
    const handlers = renderGestureHarness(() => {});
    expect(mockLatestTitlePos).not.toBeNull();
    const stopSpy = jest.spyOn(mockLatestTitlePos!, "stopAnimation");
    const stopOpacitySpy = jest.spyOn(mockLatestTitleOpacityPos!, "stopAnimation");

    act(() => {
      handlers.onResponderGrant(fakeTouch(0, 0, 1));
    });

    expect(stopSpy).toHaveBeenCalled();
    expect(stopOpacitySpy).toHaveBeenCalled();
  });

  it("(a) onPanResponderMove drives the shared position continuously across two in-flight moves, well before any commit", () => {
    const onActiveIndexChange = jest.fn();
    const handlers = renderGestureHarness(onActiveIndexChange);

    act(() => {
      handlers.onResponderGrant(fakeTouch(0, 0, 1));
    });
    act(() => {
      // Finger moves left half of PANE_DRAG_PX: paneDragPosition(1, -PANE_DRAG_PX/2) = 1.5.
      handlers.onResponderMove(fakeTouch(0, -PANE_DRAG_PX / 2, 2));
    });
    expect(readAnimatedValue(mockLatestTitlePos!)).toBeCloseTo(1.5);
    expect(onActiveIndexChange).not.toHaveBeenCalled();

    act(() => {
      // Finger continues to 3/4 of PANE_DRAG_PX total -> paneDragPosition(1, ...) = 1.75.
      handlers.onResponderMove(fakeTouch(-PANE_DRAG_PX / 2, -PANE_DRAG_PX * 0.75, 3));
    });
    expect(readAnimatedValue(mockLatestTitlePos!)).toBeCloseTo(1.75);
    expect(onActiveIndexChange).not.toHaveBeenCalled();
  });

  it("(c) release below SWIPE_COMMIT_PX and below SWIPE_FLING_VELOCITY settles back to the drag-start index", () => {
    const onActiveIndexChange = jest.fn();
    const handlers = renderGestureHarness(onActiveIndexChange);
    const timingSpy = jest.spyOn(Animated, "timing");

    act(() => {
      handlers.onResponderGrant(fakeTouch(0, 0, 1));
    });
    act(() => {
      // dx=-45 (below the 60px commit threshold) over a realistic 1000ms -- vx a tiny -0.045px/ms,
      // nowhere near SWIPE_FLING_VELOCITY (see fakeTouch's own doc on why the gap has to be
      // realistic here: release reuses this move's vx as-is).
      handlers.onResponderMove(fakeTouch(0, -45, 1000));
    });
    const callsBeforeRelease = timingSpy.mock.calls.length;
    act(() => {
      handlers.onResponderRelease(fakeTouch(-45, -45, 1001));
    });

    expect(onActiveIndexChange).not.toHaveBeenCalled();
    const settleCalls = timingSpy.mock.calls.slice(callsBeforeRelease);
    expect(settleCalls.length).toBeGreaterThan(0);
    for (const [, config] of settleCalls) {
      expect((config as { toValue: number }).toValue).toBe(1); // dragStartIndex, not a new commit
    }
  });

  it("(c) release above SWIPE_COMMIT_PX commits to the neighboring pane", () => {
    const onActiveIndexChange = jest.fn();
    const handlers = renderGestureHarness(onActiveIndexChange);
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

    expect(onActiveIndexChange).toHaveBeenCalledWith(2); // negative dx commits to the next pane
    const settleCalls = timingSpy.mock.calls.slice(callsBeforeRelease);
    expect(settleCalls.length).toBeGreaterThan(0);
    for (const [, config] of settleCalls) {
      expect((config as { toValue: number }).toValue).toBe(2);
    }
  });

  // Regression guard (PR #339 review): settlePosition's `from` argument (the actual in-flight drag
  // position at release) is what makes settleDuration scale the animation by real remaining
  // distance -- without it, `from` defaults to `target` and every release settles over a flat 40%
  // of the base duration, indistinguishable from a release that had barely moved at all. Reverting
  // the gesture handlers back to `settlePosition(next)` (dropping the drag-position argument) left
  // every other test in this file green, since none of them assert on `duration` -- only `toValue`.
  it("(d) release settle duration reflects the in-flight drag position, not a target-only fallback", () => {
    const onActiveIndexChange = jest.fn();
    const handlers = renderGestureHarness(onActiveIndexChange);
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

    expect(onActiveIndexChange).toHaveBeenCalledWith(2);
    const fromPos = paneDragPosition(1, -80);
    const expectedTransformDuration = settleDuration(fromPos, 2, 340);
    const expectedOpacityDuration = settleDuration(fromPos, 2, 260);
    // Both computed durations sit above the 40% floor -- a `from` defaulting to the target (the
    // bug this guards against) would floor both at 340*0.4 / 260*0.4 instead.
    expect(expectedTransformDuration).not.toBeCloseTo(340 * 0.4);
    expect(expectedOpacityDuration).not.toBeCloseTo(260 * 0.4);

    const durations = timingSpy.mock.calls.slice(callsBeforeRelease).map(([, config]) => (config as { duration: number }).duration);
    expect(durations).toContainEqual(expectedTransformDuration);
    expect(durations).toContainEqual(expectedOpacityDuration);
  });

  // The fling path (paneShell.test.ts unit-tests paneIndexForSwipe's own vx arithmetic) -- this
  // proves the real PanResponder's computed gesture.vx actually reaches it end to end: a fast
  // flick commits even though dx alone never gets anywhere near SWIPE_COMMIT_PX.
  it("(fling) a fast flick well short of SWIPE_COMMIT_PX still commits, driven by the release's carried-over velocity", () => {
    const onActiveIndexChange = jest.fn();
    const handlers = renderGestureHarness(onActiveIndexChange);

    act(() => {
      handlers.onResponderGrant(fakeTouch(0, 0, 1));
    });
    act(() => {
      // Small settling move first (realistic dt, negligible vx) so the flick below is measured
      // against a normal previous timestamp, not the _accountsForMovesUpTo-starts-at-0 artifact.
      handlers.onResponderMove(fakeTouch(0, -5, 1000));
    });
    act(() => {
      // 20px more in 16ms (one frame) -> vx = -20/16 = -1.25px/ms, well past SWIPE_FLING_VELOCITY
      // (0.5) -- total dx is only -25, far short of SWIPE_COMMIT_PX (60).
      handlers.onResponderMove(fakeTouch(-5, -25, 1016));
    });
    act(() => {
      handlers.onResponderRelease(fakeTouch(-25, -25, 1017));
    });

    expect(onActiveIndexChange).toHaveBeenCalledWith(2);
  });
});

// #336: activeIndexRef's sync used to be a write during render (`activeIndexRef.current =
// activeIndex`, no effect) -- moved into a useLayoutEffect. Jest doesn't run the React Compiler
// transform (jest-expo's babel-jest pipeline never sets babel-preset-expo's
// isReactCompilerEnabled option), so this can't reproduce the actual miscompilation this guarded
// against -- both the old write-during-render code and the fixed useLayoutEffect version execute
// the sync on every real render here, so this test passes against either. It's a regression
// guard for the sync CONTRACT (activeIndexRef reflects a prop-driven activeIndex change before
// the next gesture reads it), not a reproduction of the compiler bug -- it would catch someone
// later deleting the sync outright or deferring it past the next render.
describe("PaneStack activeIndexRef sync (#336)", () => {
  it("a swipe resolves against activeIndex as of the most recent prop update, not the value at mount", () => {
    const onActiveIndexChange = jest.fn();
    const panesProp = [<Pane key="s" label="Social" />, <Pane key="h" label="Home" />, <Pane key="y" label="You" />];
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <PaneStack activeIndex={0} onActiveIndexChange={onActiveIndexChange} topInset={0} panes={panesProp} />,
      );
    });

    // activeIndex changes "mid-drag some other way" (PaneStack.tsx's own comment on why this is a
    // ref, not state) -- e.g. a PaneHeader dot tap -- via a prop update, not a gesture this
    // component's own responder drove.
    act(() => {
      root.update(<PaneStack activeIndex={1} onActiveIndexChange={onActiveIndexChange} topInset={0} panes={panesProp} />);
    });

    const candidates = root.root.findAllByType(View).filter((n) => typeof n.props.onResponderGrant === "function");
    expect(candidates.length).toBe(1);
    const handlers = candidates[0].props as {
      onResponderGrant: (e: unknown) => void;
      onResponderMove: (e: unknown) => void;
      onResponderRelease: (e: unknown) => void;
    };

    act(() => {
      handlers.onResponderGrant(fakeTouch(0, 0, 1));
    });
    act(() => {
      handlers.onResponderMove(fakeTouch(0, -80, 2)); // dx=-80, past the 60px commit threshold
    });
    act(() => {
      handlers.onResponderRelease(fakeTouch(-80, -80, 3));
    });

    // dragStartIndex should have captured activeIndexRef.current == 1 (the post-update value) at
    // grant time, so a commit lands on pane 2 -- not pane 1, which is where a stale ref (still 0
    // from mount) would resolve the swipe instead.
    expect(onActiveIndexChange).toHaveBeenCalledWith(2);
  });
});

describe("PaneStack", () => {
  it("mounts PaneHeader exactly once and keeps it mounted across every pane switch", async () => {
    await act(async () => {
      renderer.create(<Harness />);
    });
    expect(mockMountCount.current).toBe(1);

    for (const target of [0, 2, 1, 0, 2]) {
      await act(async () => {
        mockLatestOnSelectPane?.(target);
      });
    }

    expect(mockMountCount.current).toBe(1);
  });

  it("passes the current activeIndex through to the header (drives its dot active-state)", async () => {
    await act(async () => {
      renderer.create(
        <PaneStack
          activeIndex={2}
          onActiveIndexChange={() => {}}
          topInset={0}
          panes={[<Pane key="s" label="Social" />, <Pane key="h" label="Home" />, <Pane key="y" label="You" />]}
        />,
      );
    });
    expect(mockLatestActiveIndex).toBe(2);
  });

  it("gives only the active pane live touches, per paneVisibility", async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<Harness />);
    });
    const socialText = root.root.findByProps({ children: "Social" });
    const homeText = root.root.findByProps({ children: "Home" });
    // Walk up to each pane's Animated.View wrapper (the direct View ancestor carrying pointerEvents).
    function pointerEventsOf(node: renderer.ReactTestInstance): unknown {
      let n: renderer.ReactTestInstance | null = node;
      while (n) {
        if (n.props.pointerEvents !== undefined) return n.props.pointerEvents;
        n = n.parent;
      }
      return undefined;
    }
    expect(pointerEventsOf(homeText)).toBe("auto"); // HOME_PANE_INDEX starts active
    expect(pointerEventsOf(socialText)).toBe("none");
  });
});
