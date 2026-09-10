import { Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import type { GestureType, GestureUpdateEvent } from "react-native-gesture-handler";
import * as Reanimated from "react-native-reanimated";
import renderer, { act } from "react-test-renderer";
import { MealTabPager } from "./MealTabPager";
import { PANE_DRAG_PX, paneDragPosition, settleDuration } from "../lib/paneShell";
import { durations, reanimatedPaneCurve } from "../lib/motion";

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

  // Android jank fix: without this prop, animating a MealTabPane's transform can't be flattened
  // into a cached bitmap layer, so Android recomposites the real (heavy SectionList) subtree every
  // frame instead -- this is the pane most worth fixing, per MealTabPane's own doc comment.
  it("marks each pane's Animated.View host for hardware-texture rendering on Android", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<MealTabPager activeIndex={1} onActiveIndexChange={() => {}} panes={fivePanes()} />);
    });
    const hostViews = root.root.findAllByType(View);
    const panes = hostViews.filter((n) => n.props.importantForAccessibility !== undefined);
    expect(panes.length).toBeGreaterThan(0);
    for (const p of panes) expect(p.props.renderToHardwareTextureAndroid).toBe(true);
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

  // Motion tokens: durations.pane/paneFade and the shared pane curve, not a hand-copied literal.
  it("tweens with durations.pane/paneFade and the shared pane curve", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<MealTabPager activeIndex={1} onActiveIndexChange={() => {}} panes={fivePanes()} />);
    });
    const callsBefore = withTimingSpy.mock.calls.length;

    act(() => {
      root.update(<MealTabPager activeIndex={2} onActiveIndexChange={() => {}} panes={fivePanes()} />);
    });

    const calls = withTimingSpy.mock.calls.slice(callsBefore);
    const transformCall = calls.find(([, config]) => (config as { duration?: number })?.duration === durations.pane);
    const opacityCall = calls.find(([, config]) => (config as { duration?: number })?.duration === durations.paneFade);
    expect(transformCall).toBeDefined();
    expect((transformCall?.[1] as { easing?: unknown })?.easing).toBe(reanimatedPaneCurve);
    expect(opacityCall).toBeDefined();
    expect((opacityCall?.[1] as { easing?: unknown })?.easing).toBe(Reanimated.Easing.ease);
  });
});

// #117 follow-up: opening a hall outside lunch hours used to visibly swipe from the static "lunch"
// default to the real current meal once hours loaded, because this single-step index change always
// tweened. instantRef lets a caller (the data-driven auto-correction, not a real swipe) opt one
// specific commit out of that tween.
describe("MealTabPager instantRef (data-driven auto-correction, not a real swipe)", () => {
  it("snaps instead of tweening a single-step index change when instantRef.current is true, and consumes the flag", () => {
    let root!: renderer.ReactTestRenderer;
    const instantRef = { current: false };
    act(() => {
      root = renderer.create(<MealTabPager activeIndex={1} onActiveIndexChange={() => {}} panes={fivePanes()} instantRef={instantRef} />);
    });
    const callsBefore = withTimingSpy.mock.calls.length;
    instantRef.current = true;

    act(() => {
      root.update(<MealTabPager activeIndex={2} onActiveIndexChange={() => {}} panes={fivePanes()} instantRef={instantRef} />);
    });

    expect(withTimingSpy.mock.calls.slice(callsBefore).length).toBe(0);
    expect(instantRef.current).toBe(false); // one-shot: consumed by the commit it applied to

    // The flag was consumed -- a later single-step change tweens normally again.
    const callsBeforeNext = withTimingSpy.mock.calls.length;
    act(() => {
      root.update(<MealTabPager activeIndex={3} onActiveIndexChange={() => {}} panes={fivePanes()} instantRef={instantRef} />);
    });
    expect(withTimingSpy.mock.calls.slice(callsBeforeNext).length).toBe(2);
  });

  it("tweens normally when instantRef is omitted entirely", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<MealTabPager activeIndex={1} onActiveIndexChange={() => {}} panes={fivePanes()} />);
    });
    const callsBefore = withTimingSpy.mock.calls.length;

    act(() => {
      root.update(<MealTabPager activeIndex={2} onActiveIndexChange={() => {}} panes={fivePanes()} />);
    });

    expect(withTimingSpy.mock.calls.slice(callsBefore).length).toBe(2);
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

  // A real fast back-and-forth swipe: the second gesture begins before React has re-rendered with
  // the first gesture's committed activeIndex (onActiveIndexChange's runOnJS callback hasn't
  // round-tripped to a `root.update` yet, deliberately omitted below to simulate that gap). Before
  // this fix, onStart reseeded dragStartIndex from the stale `activeIndex` prop and onEnd's commit
  // guard compared `next` against that same stale prop -- together they could compute the wrong
  // `next` AND silently swallow the correct one, which is what "swiping back and forth quickly
  // skips a tab" actually was.
  it("a swipe immediately reversed, before activeIndex's own commit has rendered, resolves back to the true starting tab", () => {
    const onActiveIndexChange = jest.fn();
    const { gesture } = renderGestureHarness(1, fivePanes(), onActiveIndexChange); // start on Lunch (1)

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(-80)); // leftward past SWIPE_COMMIT_PX
    });
    act(() => {
      gesture().handlers.onEnd?.(panEvent(-80), true); // commits Lunch (1) -> Dinner (2)
    });

    // No root.update here -- activeIndex is still 1 in this tree's closures, exactly the race.
    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(80)); // rightward, reversing
    });
    act(() => {
      gesture().handlers.onEnd?.(panEvent(80), true); // should commit Dinner (2) -> back to Lunch (1)
    });

    expect(onActiveIndexChange).toHaveBeenNthCalledWith(1, 2);
    expect(onActiveIndexChange).toHaveBeenNthCalledWith(2, 1);
  });
});

// On-device (emulator) verification of round-4's rapid-reversal fix above found it incomplete: 5
// quick alternating swipes landed on the wrong tab every time, with two panes' content and the tab
// underline briefly visible at once -- corruption the 2-cycle test above (which never lets React
// actually re-render between gestures, so this component's own commit-effect never fires) couldn't
// see. Root cause: that effect used to track "where did the animated position last land" with its
// own separate `committedIndexRef`, on the JS thread, updated only when the effect itself ran --
// but `dragStartIndex` (the shared value onEnd already writes eagerly, on the UI thread, the
// instant a swipe commits) is the SAME fact tracked a second, independently-updated way. Once a
// swipe's commit round-trips back to a render, the effect fired again anyway and started a SECOND,
// redundant withTiming retargeting the exact position the gesture's own onEnd had already started
// settling -- under a rapid sequence, each new commit's effect re-fires before the previous one (or
// the gesture that caused it) has settled, piling up competing tweens that never cleanly resolve.
describe("MealTabPager commit-effect vs. gesture-settle race", () => {
  function swipeCommit(gesture: () => GestureType, dx: number) {
    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(dx));
    });
    act(() => {
      gesture().handlers.onEnd?.(panEvent(dx), true);
    });
  }

  it("does not re-tween a swipe's own commit once it round-trips back to a render", () => {
    const onActiveIndexChange = jest.fn();
    const { root, gesture } = renderGestureHarness(0, fivePanes(), onActiveIndexChange);

    swipeCommit(gesture, -80); // commits Breakfast (0) -> Lunch (1)
    const callsAfterGesture = withTimingSpy.mock.calls.length; // settlePosition's own 2 calls (panePos + paneOpacityPos)
    expect(callsAfterGesture).toBe(2);

    // The commit round-trips back to a real render -- this is what the 2-cycle test above never
    // does, and exactly the point where the old, separately-tracked committedIndexRef could (and
    // did, on-device) disagree with dragStartIndex about whether anything was still left to animate.
    act(() => {
      root.update(<MealTabPager activeIndex={1} onActiveIndexChange={onActiveIndexChange} panes={fivePanes()} />);
    });

    // No additional tween -- the gesture already fully handled this exact transition.
    expect(withTimingSpy.mock.calls.length).toBe(callsAfterGesture);
  });

  it("resolves 5 rapid alternating swipes to the true starting tab, each fully settled before the next begins", () => {
    const onActiveIndexChange = jest.fn();
    let activeIndex = 1; // start on Lunch
    const { root, gesture } = renderGestureHarness(activeIndex, fivePanes(), onActiveIndexChange);

    for (let i = 0; i < 5; i++) {
      const dx = i % 2 === 0 ? -80 : 80; // alternate: forward, back, forward, back, forward
      swipeCommit(gesture, dx);
      activeIndex = onActiveIndexChange.mock.calls.at(-1)![0];
      act(() => {
        root.update(<MealTabPager activeIndex={activeIndex} onActiveIndexChange={onActiveIndexChange} panes={fivePanes()} />);
      });
    }

    // 5 alternating commits from Lunch (1): 2, 1, 2, 1, 2 -- ends one tab over (Dinner), an odd
    // number of steps taken. Every intermediate commit must also have been correct (not skipped,
    // not doubled) for this final value to be right at all.
    expect(activeIndex).toBe(2);
    expect(onActiveIndexChange.mock.calls.map((c) => c[0])).toEqual([2, 1, 2, 1, 2]);
    // Exactly one settle (2 withTiming calls) per commit -- no redundant effect-triggered retween.
    expect(withTimingSpy.mock.calls.length).toBe(10);
  });
});
