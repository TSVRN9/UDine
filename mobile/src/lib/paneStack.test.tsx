import { useState } from "react";
import { Text } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import type { GestureType, GestureUpdateEvent } from "react-native-gesture-handler";
import * as Reanimated from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import renderer, { act } from "react-test-renderer";

import { PaneStack } from "../components/PaneStack";
import { PANE_DRAG_PX, paneDragPosition, settleDuration } from "./paneShell";

// Jest hoists jest.mock() above imports and only allows referencing out-of-scope variables whose
// name starts with "mock" inside the factory -- hence the prefix on all three.
const mockMountCount = { current: 0 };
let mockLatestOnSelectPane: ((index: number) => void) | null = null;
let mockLatestActiveIndex = -1;
// #245: captured so gesture tests can read the SAME shared values PaneStack drives via
// onUpdate/settlePosition -- proves the wiring reaches PaneHeader's shared title tracking, not just
// the pure paneDragPosition helper.
let mockLatestTitlePos: SharedValue<number> | null = null;
let mockLatestTitleOpacityPos: SharedValue<number> | null = null;

// #179: PaneHeader must mount exactly once and stay mounted across every pane switch -- a remount
// would restart its internal shared values (title crossfade, dot morph) and desync them from the
// pane transition they're meant to track. Mocked here (not rendered for real) so the assertion is
// about PaneStack's own composition -- header once, outside the per-pane loop -- not about
// PaneHeader's internals, which PaneHeader.tsx's own concerns cover.
jest.mock("../components/PaneHeader", () => {
  const React = require("react");
  return {
    PaneHeader: (props: {
      activeIndex: number;
      onSelectPane: (index: number) => void;
      titlePos?: SharedValue<number>;
      titleOpacityPos?: SharedValue<number>;
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

// react-native-worklets' Babel plugin auto-workletizes the callbacks passed to `Gesture.Pan()`'s
// `.onBegin`/`.onUpdate`/`.onEnd` (and any function marked "worklet", like PaneStack's own
// `settlePosition`/`cancelInFlightSettle`): it rewrites their free-variable references (including
// imported reanimated functions like `withTiming`/`cancelAnimation`) into reads off a `__closure`
// object POPULATED ONCE, AT THE MOMENT THE GESTURE OBJECT IS BUILT (i.e. at render time) -- not a
// live property lookup on every call the way a plain (non-worklet) function reads an import. That's
// the correct, intentional design for real native execution (a UI-thread worklet can't do a live
// module lookup back into the JS thread's module registry) -- but it means `jest.spyOn(Reanimated,
// "withTiming")` only reaches calls made from closures built AFTER the spy exists. Installing both
// spies here, at module scope (before any test/render runs), instead of inside each `it()` after
// its own render, is what makes every render in this file -- including the very first one --
// capture the spied versions. Confirmed empirically: spying after a render's own worklets were
// already built left `spy.mock.calls` at 0 for that render's callbacks, even though the calls
// genuinely happened (verified via a temporary console.log inside PaneStack.tsx itself).
const withTimingSpy = jest.spyOn(Reanimated, "withTiming");
const cancelAnimationSpy = jest.spyOn(Reanimated, "cancelAnimation");

afterEach(() => {
  withTimingSpy.mockClear();
  cancelAnimationSpy.mockClear();
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

// Gesture.Pan()'s callbacks are plain functions stored on the built gesture object's own
// `.handlers` (react-native-gesture-handler/src/handlers/gestures/gesture.ts's BaseGesture --
// `.onBegin(cb)`/`.onUpdate(cb)`/`.onEnd(cb)` just assign `this.handlers.onBegin = cb` etc.), so a
// test can invoke them directly instead of simulating the full native event pipeline.
// `translationX` is RNGH's name for the SAME "total accumulated distance since the gesture began"
// PanResponder called `gestureState.dx` (confirmed against RN's own PanResponder docs and this
// file's pre-migration fakeTouch helper) -- so every dx/vx value below carries over unchanged from
// the PanResponder-era tests this file replaces.
function panEvent(translationX: number, velocityX = 0) {
  return {
    translationX,
    translationY: 0,
    velocityX,
    velocityY: 0,
    x: 0,
    y: 0,
    absoluteX: 0,
    absoluteY: 0,
    numberOfPointers: 1,
    stylusData: undefined,
  } as unknown as GestureUpdateEvent<never>;
}

describe("PaneStack swipe gesture wiring (#245 item 2)", () => {
  // Renders with activeIndex=1 (Home) and returns the built Gesture.Pan() object off the
  // GestureDetector -- see MealTabPager.test.tsx's identical helper for why this is re-read from
  // the CURRENT tree rather than captured once: PaneStack rebuilds the gesture fresh every render
  // (this component's own doc comment explains why), so the gesture actually wired to the latest
  // props is whichever one the CURRENT tree holds.
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
    function gesture(): GestureType {
      return root.root.findByType(GestureDetector).props.gesture as GestureType;
    }
    return gesture;
  }

  it("(b) onStart (the gesture actually being recognized) stops any in-flight settle animation before a new drag starts", () => {
    const gesture = renderGestureHarness(() => {});
    expect(mockLatestTitlePos).not.toBeNull();

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });

    expect(cancelAnimationSpy).toHaveBeenCalledWith(mockLatestTitlePos);
    expect(cancelAnimationSpy).toHaveBeenCalledWith(mockLatestTitleOpacityPos);
  });

  // Regression guard: `onBegin` fires at BEGAN -- on every touch-down, before `activeOffsetX` is
  // even crossed -- so a touch that never becomes a swipe (a tap, a vertical scroll that stays
  // under the horizontal threshold) must NOT disturb an in-flight settle. Only `onStart` (ACTIVE)
  // should. Getting this wrong (capturing dragStartIndex / cancelling the settle in `onBegin`
  // instead of `onStart`) is invisible to every other test in this file, since none of them
  // exercise `onBegin` in isolation without a following `onStart` -- and it's a real regression:
  // RNGH's own doc comment on `onEnd` says it "will be called only if the handler was previously in
  // the ACTIVE state", so a gesture that begins and then fails (never reaches ACTIVE) never fires
  // onEnd either -- nothing would ever restore a settle animation cancelled at BEGAN.
  it("onBegin alone (a touch that never activates) does not cancel an in-flight settle", () => {
    const gesture = renderGestureHarness(() => {});
    cancelAnimationSpy.mockClear();

    act(() => {
      gesture().handlers.onBegin?.(panEvent(0));
    });

    expect(cancelAnimationSpy).not.toHaveBeenCalled();
  });

  it("(a) onPanResponderMove drives the shared position continuously across two in-flight moves, well before any commit", () => {
    const onActiveIndexChange = jest.fn();
    const gesture = renderGestureHarness(onActiveIndexChange);

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      // Finger moves left half of PANE_DRAG_PX: paneDragPosition(1, -PANE_DRAG_PX/2) = 1.5.
      gesture().handlers.onUpdate?.(panEvent(-PANE_DRAG_PX / 2));
    });
    expect(mockLatestTitlePos!.value).toBeCloseTo(1.5);
    expect(onActiveIndexChange).not.toHaveBeenCalled();

    act(() => {
      // Finger continues to 3/4 of PANE_DRAG_PX total -> paneDragPosition(1, ...) = 1.75.
      gesture().handlers.onUpdate?.(panEvent(-PANE_DRAG_PX * 0.75));
    });
    expect(mockLatestTitlePos!.value).toBeCloseTo(1.75);
    expect(onActiveIndexChange).not.toHaveBeenCalled();
  });

  it("(c) release below SWIPE_COMMIT_PX and below SWIPE_FLING_VELOCITY settles back to the drag-start index", () => {
    const onActiveIndexChange = jest.fn();
    const gesture = renderGestureHarness(onActiveIndexChange);

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      // dx=-45 (below the 60px commit threshold), vx a gentle -45pts/s, nowhere near
      // SWIPE_FLING_VELOCITY (500).
      gesture().handlers.onUpdate?.(panEvent(-45));
    });
    const callsBeforeRelease = withTimingSpy.mock.calls.length;
    act(() => {
      gesture().handlers.onEnd?.(panEvent(-45, -45), true);
    });

    expect(onActiveIndexChange).not.toHaveBeenCalled();
    const settleCalls = withTimingSpy.mock.calls.slice(callsBeforeRelease);
    expect(settleCalls.length).toBeGreaterThan(0);
    for (const [toValue] of settleCalls) {
      expect(toValue).toBe(1); // dragStartIndex, not a new commit
    }
  });

  it("(c) release above SWIPE_COMMIT_PX commits to the neighboring pane", () => {
    const onActiveIndexChange = jest.fn();
    const gesture = renderGestureHarness(onActiveIndexChange);

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(-80)); // dx=-80, past the 60px commit threshold
    });
    const callsBeforeRelease = withTimingSpy.mock.calls.length;
    act(() => {
      gesture().handlers.onEnd?.(panEvent(-80), true);
    });

    expect(onActiveIndexChange).toHaveBeenCalledWith(2); // negative dx commits to the next pane
    const settleCalls = withTimingSpy.mock.calls.slice(callsBeforeRelease);
    expect(settleCalls.length).toBeGreaterThan(0);
    for (const [toValue] of settleCalls) {
      expect(toValue).toBe(2);
    }
  });

  // Regression guard (PR #339 review): settlePosition's `from` argument (the actual in-flight drag
  // position at release) is what makes settleDuration scale the animation by real remaining
  // distance -- without it, `from` defaults to `target` and every release settles over a flat 40%
  // of the base duration, indistinguishable from a release that had barely moved at all.
  it("(d) release settle duration reflects the in-flight drag position, not a target-only fallback", () => {
    const onActiveIndexChange = jest.fn();
    const gesture = renderGestureHarness(onActiveIndexChange);

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(-80)); // dx=-80, past the 60px commit threshold
    });
    const callsBeforeRelease = withTimingSpy.mock.calls.length;
    act(() => {
      gesture().handlers.onEnd?.(panEvent(-80), true);
    });

    expect(onActiveIndexChange).toHaveBeenCalledWith(2);
    const fromPos = paneDragPosition(1, -80);
    const expectedTransformDuration = settleDuration(fromPos, 2, 340);
    const expectedOpacityDuration = settleDuration(fromPos, 2, 260);
    // Both computed durations sit above the 40% floor -- a `from` defaulting to the target (the
    // bug this guards against) would floor both at 340*0.4 / 260*0.4 instead.
    expect(expectedTransformDuration).not.toBeCloseTo(340 * 0.4);
    expect(expectedOpacityDuration).not.toBeCloseTo(260 * 0.4);

    const durations = withTimingSpy.mock.calls
      .slice(callsBeforeRelease)
      .map(([, config]) => (config as { duration: number }).duration);
    expect(durations).toContainEqual(expectedTransformDuration);
    expect(durations).toContainEqual(expectedOpacityDuration);
  });

  // The fling path (paneShell.test.ts unit-tests paneIndexForSwipe's own vx arithmetic) -- this
  // proves the real gesture callback's velocityX actually reaches it end to end: a fast flick
  // commits even though dx alone never gets anywhere near SWIPE_COMMIT_PX.
  it("(fling) a fast flick well short of SWIPE_COMMIT_PX still commits, driven by the release's velocity", () => {
    const onActiveIndexChange = jest.fn();
    const gesture = renderGestureHarness(onActiveIndexChange);

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      // RNGH's velocityX is points/second, not px/ms (SWIPE_FLING_VELOCITY's own doc) -- -1250
      // is well past SWIPE_FLING_VELOCITY (500), well within the ~830-3300pts/s range measured
      // on-device for a real short flick. Total dx is only -25, far short of SWIPE_COMMIT_PX (60).
      gesture().handlers.onUpdate?.(panEvent(-25, -1250));
    });
    act(() => {
      gesture().handlers.onEnd?.(panEvent(-25, -1250), true);
    });

    expect(onActiveIndexChange).toHaveBeenCalledWith(2);
  });

  it("a cancelled/terminated drag settles back to the drag-start index instead of committing", () => {
    const onActiveIndexChange = jest.fn();
    const gesture = renderGestureHarness(onActiveIndexChange);

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(-80)); // past the commit threshold
    });
    const callsBeforeEnd = withTimingSpy.mock.calls.length;
    act(() => {
      gesture().handlers.onEnd?.(panEvent(-80), false); // cancelled, e.g. a parent gesture stole it
    });

    expect(onActiveIndexChange).not.toHaveBeenCalled();
    const settleCalls = withTimingSpy.mock.calls.slice(callsBeforeEnd);
    expect(settleCalls.length).toBeGreaterThan(0);
    for (const [toValue] of settleCalls) expect(toValue).toBe(1); // dragStartIndex, not a commit
  });
});

// PaneStack rebuilds `Gesture.Pan()` fresh every render (see its own doc comment) -- `activeIndex`
// is closed over directly rather than read off a ref, so a swipe naturally resolves against
// whatever `activeIndex` the MOST RECENT render saw. This is the same guarantee #336's old
// `activeIndexRef` sync existed to provide for the PanResponder-era `useRef`-once responder; it's
// now a structural property of "rebuild every render" rather than something that needs its own
// synchronization mechanism.
describe("PaneStack resolves a swipe against the latest activeIndex", () => {
  it("a swipe resolves against activeIndex as of the most recent prop update, not the value at mount", () => {
    const onActiveIndexChange = jest.fn();
    const panesProp = [<Pane key="s" label="Social" />, <Pane key="h" label="Home" />, <Pane key="y" label="You" />];
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <PaneStack activeIndex={0} onActiveIndexChange={onActiveIndexChange} topInset={0} panes={panesProp} />,
      );
    });

    // activeIndex changes "mid-drag some other way" -- e.g. a PaneHeader dot tap -- via a prop
    // update, not a gesture this component's own gesture drove.
    act(() => {
      root.update(<PaneStack activeIndex={1} onActiveIndexChange={onActiveIndexChange} topInset={0} panes={panesProp} />);
    });

    const gesture = root.root.findByType(GestureDetector).props.gesture as GestureType;

    act(() => {
      gesture.handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture.handlers.onUpdate?.(panEvent(-80)); // dx=-80, past the 60px commit threshold
    });
    act(() => {
      gesture.handlers.onEnd?.(panEvent(-80), true);
    });

    // dragStartIndex should have captured activeIndex == 1 (the post-update value) at grant time,
    // so a commit lands on pane 2 -- not pane 1, which is where a stale value (still 0 from mount)
    // would resolve the swipe instead.
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
