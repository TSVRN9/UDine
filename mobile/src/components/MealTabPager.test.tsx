import { Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import type { GestureType, GestureUpdateEvent } from "react-native-gesture-handler";
import * as Reanimated from "react-native-reanimated";
import renderer, { act } from "react-test-renderer";
import { MealTabPager } from "./MealTabPager";
import { PANE_DRAG_PX, paneDragPosition, settleDuration } from "../lib/paneShell";

// react-native-worklets' Babel plugin auto-workletizes the callbacks passed to `Gesture.Pan()`'s
// `.onBegin`/`.onUpdate`/`.onEnd` (and any function marked "worklet", like MealTabPager's own
// `settlePosition`): it rewrites their free-variable references (including imported reanimated
// functions like `withTiming`) into reads off a `__closure` object populated ONCE, AT THE MOMENT
// THE GESTURE OBJECT IS BUILT (i.e. at render time) -- not a live property lookup on every call the
// way a plain (non-worklet) function reads an import. That's the correct, intentional design for
// real native execution (a UI-thread worklet can't do a live module lookup back into the JS
// thread's module registry), but it means `jest.spyOn(Reanimated, "withTiming")` only reaches calls
// made from closures built AFTER the spy exists. Installing the spy here, at module scope (before
// any test/render runs), instead of inside each `it()` after its own render, is what makes every
// render in this file -- including the very first one -- capture the spied version. Confirmed
// empirically against PaneStack.tsx's identical worklets (see paneStack.test.tsx's own longer note
// on this): spying after a render's own worklets were already built left `spy.mock.calls` at 0 for
// that render's callbacks even though the calls genuinely happened.
const withTimingSpy = jest.spyOn(Reanimated, "withTiming");
const cancelAnimationSpy = jest.spyOn(Reanimated, "cancelAnimation");

afterEach(() => {
  withTimingSpy.mockClear();
  cancelAnimationSpy.mockClear();
});

function Pane({ label }: { label: string }) {
  return <Text>{label}</Text>;
}

// Gesture.Pan()'s callbacks are plain functions stored on the built gesture object's own
// `.handlers` (see react-native-gesture-handler/src/handlers/gestures/gesture.ts's BaseGesture --
// `.onBegin(cb)`/`.onUpdate(cb)`/`.onEnd(cb)` just assign `this.handlers.onBegin = cb` etc.), so a
// test can invoke them directly instead of simulating the full native event pipeline. `translationX`
// is RNGH's name for the SAME "total accumulated distance since the gesture began" PanResponder
// called `gestureState.dx` (confirmed against RN's own PanResponder docs and this file's pre-
// migration fakeTouch helper) -- so every dx/vx value below carries over unchanged from the
// PanResponder-era tests this file replaces.
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
  // Re-read from the CURRENT tree every time (not captured once) -- MealTabPager rebuilds
  // `Gesture.Pan()` fresh every render (see its own doc comment on why: RNGH's own docs warn
  // against caching a gesture object across renders), so the gesture actually wired to the latest
  // props is whichever one the CURRENT tree holds, same as how the real native side only ever calls
  // into the latest reconciled callback set.
  function gesture(): GestureType {
    return root.root.findByType(GestureDetector).props.gesture as GestureType;
  }
  return { root, gesture };
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
    const callsBefore = withTimingSpy.mock.calls.length;

    act(() => {
      root.update(<MealTabPager activeIndex={4} onActiveIndexChange={() => {}} panes={fivePanes()} />);
    });

    // No tween at all for this transition -- a mutated version that always calls withTiming would
    // show 2 calls here (panePos + paneOpacityPos) instead of 0.
    expect(withTimingSpy.mock.calls.slice(callsBefore).length).toBe(0);
    // The destination pane is immediately the sole active/visible one, not mid-crossfade.
    const hostViews = root.root.findAllByType(View);
    expect(hostViews.filter((n) => n.props.importantForAccessibility === "auto").length).toBe(1);
  });

  it("still animates smoothly via withTiming for an adjacent (single-step) index change, tab-tap or swipe alike", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<MealTabPager activeIndex={1} onActiveIndexChange={() => {}} panes={fivePanes()} />);
    });
    const callsBefore = withTimingSpy.mock.calls.length;

    act(() => {
      root.update(<MealTabPager activeIndex={2} onActiveIndexChange={() => {}} panes={fivePanes()} />);
    });

    const calls = withTimingSpy.mock.calls.slice(callsBefore);
    expect(calls.length).toBe(2); // panePos + paneOpacityPos
    for (const [toValue] of calls) expect(toValue).toBe(2);
  });
});

describe("MealTabPager swipe gesture wiring", () => {
  // Regression guard: `onBegin` fires at BEGAN -- on every touch-down, before `activeOffsetX` is
  // even crossed -- so a touch that never becomes a swipe (a tap, a vertical scroll inside a windowed
  // pane's own SectionList) must NOT disturb an in-flight settle. Only `onStart` (ACTIVE) should.
  // See paneStack.test.tsx's identical guard for the full reasoning (RNGH's `onEnd` doc comment:
  // it "will be called only if the handler was previously in the ACTIVE state", so a gesture that
  // begins and fails before activating never fires onEnd either -- nothing would ever restore a
  // settle animation cancelled at BEGAN).
  it("onBegin alone (a touch that never activates) does not cancel an in-flight settle", () => {
    const { gesture } = renderGestureHarness(1, fivePanes(), () => {});
    cancelAnimationSpy.mockClear();

    act(() => {
      gesture().handlers.onBegin?.(panEvent(0));
    });

    expect(cancelAnimationSpy).not.toHaveBeenCalled();
  });

  it("(a) onPanResponderMove drives the shared position continuously, well before any commit", () => {
    const onActiveIndexChange = jest.fn();
    const { gesture } = renderGestureHarness(1, fivePanes(), onActiveIndexChange);

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(-PANE_DRAG_PX / 2));
    });
    expect(onActiveIndexChange).not.toHaveBeenCalled();
  });

  it("(b) release below SWIPE_COMMIT_PX and below SWIPE_FLING_VELOCITY settles back, no commit", () => {
    const onActiveIndexChange = jest.fn();
    const { gesture } = renderGestureHarness(1, fivePanes(), onActiveIndexChange);

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(-45)); // below the 60px commit threshold
    });
    act(() => {
      gesture().handlers.onEnd?.(panEvent(-45, -45), true); // -45pts/s, nowhere near SWIPE_FLING_VELOCITY (500)
    });

    expect(onActiveIndexChange).not.toHaveBeenCalled();
  });

  it("(c) release above SWIPE_COMMIT_PX commits to the neighboring tab", () => {
    const onActiveIndexChange = jest.fn();
    const { gesture } = renderGestureHarness(1, fivePanes(), onActiveIndexChange);

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(-80)); // past the 60px commit threshold
    });
    const callsBeforeRelease = withTimingSpy.mock.calls.length;
    act(() => {
      gesture().handlers.onEnd?.(panEvent(-80), true);
    });

    expect(onActiveIndexChange).toHaveBeenCalledWith(2); // negative dx commits to the next tab
    const settleCalls = withTimingSpy.mock.calls.slice(callsBeforeRelease);
    expect(settleCalls.length).toBeGreaterThan(0);
    for (const [toValue] of settleCalls) expect(toValue).toBe(2);
  });

  it("(d) clamps at the last tab instead of committing past it", () => {
    const onActiveIndexChange = jest.fn();
    const { gesture } = renderGestureHarness(4, fivePanes(), onActiveIndexChange);

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(-80)); // leftward past the last tab
    });
    act(() => {
      gesture().handlers.onEnd?.(panEvent(-80), true);
    });

    expect(onActiveIndexChange).not.toHaveBeenCalled(); // already at the last index, nothing to commit to
  });

  it("(e) release settle duration reflects the in-flight drag position", () => {
    const onActiveIndexChange = jest.fn();
    const { gesture } = renderGestureHarness(1, fivePanes(), onActiveIndexChange);

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(-80));
    });
    const callsBeforeRelease = withTimingSpy.mock.calls.length;
    act(() => {
      gesture().handlers.onEnd?.(panEvent(-80), true);
    });

    const fromPos = paneDragPosition(1, -80, 5);
    const expectedTransformDuration = settleDuration(fromPos, 2, 340);
    const durations = withTimingSpy.mock.calls
      .slice(callsBeforeRelease)
      .map(([, config]) => (config as { duration: number }).duration);
    expect(durations).toContainEqual(expectedTransformDuration);
  });

  it("(fling) a fast flick well short of SWIPE_COMMIT_PX still commits", () => {
    const onActiveIndexChange = jest.fn();
    const { gesture } = renderGestureHarness(1, fivePanes(), onActiveIndexChange);

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      // RNGH's velocityX is points/second, not px/ms (SWIPE_FLING_VELOCITY's own doc) -- -1250 is
      // past SWIPE_FLING_VELOCITY (500); dx (-25) is far short of SWIPE_COMMIT_PX (60).
      gesture().handlers.onUpdate?.(panEvent(-25, -1250));
    });
    act(() => {
      gesture().handlers.onEnd?.(panEvent(-25, -1250), true);
    });

    expect(onActiveIndexChange).toHaveBeenCalledWith(2);
  });

  it("a single-tab café (panes.length === 1) never commits, whatever the drag", () => {
    const onActiveIndexChange = jest.fn();
    const { gesture } = renderGestureHarness(0, [<Pane key="allday" label="All Day" />], onActiveIndexChange);

    // .enabled(count > 1) means RNGH would never even activate this gesture natively for a single
    // tab; the callbacks below are invoked directly (bypassing that native gate, same as every
    // other test here does) purely to prove the fallback math still refuses to commit even if they
    // somehow fired.
    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(-80));
    });
    act(() => {
      gesture().handlers.onEnd?.(panEvent(-80), true);
    });

    expect(onActiveIndexChange).not.toHaveBeenCalled();
  });

  it("a cancelled/terminated drag settles back to the drag-start index instead of committing", () => {
    const onActiveIndexChange = jest.fn();
    const { gesture } = renderGestureHarness(1, fivePanes(), onActiveIndexChange);

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

// The old PanResponder-era version of this suite guarded against a `useRef`-once PanResponder
// closing over a stale `panes.length`/`onActiveIndexChange` forever after construction. Rebuilding
// `Gesture.Pan()` fresh every render (this component's own doc comment explains why) removes that
// failure mode structurally -- there's no persisted closure to go stale -- but this test still
// exercises the same scenario end to end: a swipe after `panes.length` shrinks on the SAME mounted
// instance must resolve against the fresh count.
describe("MealTabPager stale-closure resistance", () => {
  it("a swipe after panes.length shrinks on the same mounted instance resolves against the fresh count, not a count from an earlier render", () => {
    const onActiveIndexChange = jest.fn();
    const fourPanes = fivePanes().slice(0, 4); // indices 0-3
    const { root, gesture } = renderGestureHarness(3, fourPanes, onActiveIndexChange); // active on the last of 4

    const threePanes = fivePanes().slice(0, 3);
    act(() => {
      root.update(<MealTabPager activeIndex={2} onActiveIndexChange={onActiveIndexChange} panes={threePanes} />);
    });

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(-80)); // leftward past SWIPE_COMMIT_PX -- "commit to the next tab"
    });
    act(() => {
      gesture().handlers.onEnd?.(panEvent(-80), true);
    });

    // Fresh count (3): activeIndex 2 is already the last valid index -- clamped, no commit.
    expect(onActiveIndexChange).not.toHaveBeenCalled();
  });
});
