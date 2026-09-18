import { useEffect } from "react";
import { View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import type { GestureType, GestureUpdateEvent } from "react-native-gesture-handler";
import * as Reanimated from "react-native-reanimated";
import TestRenderer, { act } from "react-test-renderer";
import { behindSheetA11yProps, SHEET_DISMISS_PX, SHEET_FLING_VELOCITY, shouldDismissSheet, useDraggableSheet } from "./sheetAnimation";
import { durations, reanimatedPaneCurve } from "./motion";
import { settleDuration } from "./paneShell";

// Same reasoning as paneStack.test.tsx's own comment on this exact pattern: react-native-worklets'
// Babel plugin bakes a worklet's free variables (imported reanimated functions included) into a
// `__closure` object populated ONCE, at gesture-build time (render time) -- so `jest.spyOn` must
// exist before any render, at module scope, or the very first render's callbacks close over the
// real (unspied) function instead.
//
// A full mockImplementation, not just a spy on the real mock's passthrough: the shipped
// react-native-reanimated/mock's own `withTiming` invokes its callback SYNCHRONOUSLY with
// `finished: true` on every call (see node_modules/react-native-reanimated/src/mock.ts), which
// would make the close path's `modalVisible` flip false in the same tick as the close animation
// starts -- exactly indistinguishable from the pre-fix bug this hook exists to close. Capturing the
// callback instead of auto-firing it is what lets these tests actually drive "the close animation
// hasn't finished yet" as its own observable state.
const withTimingCalls: { toValue: number; config?: { duration?: number; easing?: unknown }; callback?: (finished?: boolean) => void }[] = [];
const withTimingSpy = jest
  .spyOn(Reanimated, "withTiming")
  .mockImplementation(((toValue: number, config?: { duration?: number; easing?: unknown }, callback?: (finished?: boolean) => void) => {
    withTimingCalls.push({ toValue, config, callback });
    return toValue as unknown as ReturnType<typeof Reanimated.withTiming>;
  }) as typeof Reanimated.withTiming);
const cancelAnimationSpy = jest.spyOn(Reanimated, "cancelAnimation");

afterEach(() => {
  withTimingSpy.mockClear();
  cancelAnimationSpy.mockClear();
  withTimingCalls.length = 0;
});

let latestModalVisible = false;

function Harness({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { gesture, modalVisible } = useDraggableSheet(visible, onClose);
  useEffect(() => {
    latestModalVisible = modalVisible;
  });
  return (
    <GestureDetector gesture={gesture}>
      <View />
    </GestureDetector>
  );
}

// Y-axis analog of paneStack.test.tsx's own `panEvent` helper -- translationY/velocityY are what
// this hook's vertical drag reads; the other fields are just shape filler for the event type.
function panEvent(translationY: number, velocityY = 0): GestureUpdateEvent<never> {
  return {
    translationX: 0,
    translationY,
    velocityX: 0,
    velocityY,
    x: 0,
    y: 0,
    absoluteX: 0,
    absoluteY: 0,
    numberOfPointers: 1,
    stylusData: undefined,
  } as unknown as GestureUpdateEvent<never>;
}

// PR #514 review: an in-tree overlay sheet (PlateSheet, no longer an RN Modal) doesn't take its
// siblings out of the accessibility tree the way a Dialog window did -- a screen-reader user could
// swipe to, and activate, hall-menu steppers/tabs/FAB sitting invisible behind the scrim. The
// caller fences its background with these props, same pattern as MealTabPager's inactive panes.
describe("behindSheetA11yProps", () => {
  it("hides the background subtree from assistive tech while the sheet is open", () => {
    expect(behindSheetA11yProps(true)).toEqual({ accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" });
  });
  it("restores normal accessibility once the sheet is closed", () => {
    expect(behindSheetA11yProps(false)).toEqual({ accessibilityElementsHidden: false, importantForAccessibility: "auto" });
  });
});

describe("shouldDismissSheet", () => {
  it("does not commit under both thresholds", () => {
    expect(shouldDismissSheet(SHEET_DISMISS_PX - 1, SHEET_FLING_VELOCITY - 1)).toBe(false);
  });

  it("commits once the drag distance reaches SHEET_DISMISS_PX, even at zero velocity", () => {
    expect(shouldDismissSheet(SHEET_DISMISS_PX, 0)).toBe(true);
  });

  it("commits on a fast flick well short of SHEET_DISMISS_PX, once velocity reaches SHEET_FLING_VELOCITY", () => {
    expect(shouldDismissSheet(5, SHEET_FLING_VELOCITY)).toBe(true);
  });

  it("does not commit just short of the velocity threshold with negligible distance", () => {
    expect(shouldDismissSheet(5, SHEET_FLING_VELOCITY - 1)).toBe(false);
  });
});

describe("useDraggableSheet modal timing", () => {
  it("flips modalVisible true immediately when visible becomes true (open is never delayed)", () => {
    let root!: TestRenderer.ReactTestRenderer;
    act(() => {
      root = TestRenderer.create(<Harness visible={false} onClose={() => {}} />);
    });
    expect(latestModalVisible).toBe(false);

    act(() => {
      root.update(<Harness visible={true} onClose={() => {}} />);
    });
    expect(latestModalVisible).toBe(true);
  });

  // The actual bug: RN's <Modal visible={false}> unmounts synchronously, so the fix must keep the
  // Modal mounted (modalVisible still true) for the whole close animation, only flipping false from
  // the animation's own completion callback.
  it("keeps modalVisible true until the close animation's completion callback fires", () => {
    let root!: TestRenderer.ReactTestRenderer;
    act(() => {
      root = TestRenderer.create(<Harness visible={true} onClose={() => {}} />);
    });
    expect(latestModalVisible).toBe(true);

    act(() => {
      root.update(<Harness visible={false} onClose={() => {}} />);
    });
    // Not yet -- the close withTiming was started but its callback (captured below) hasn't run.
    expect(latestModalVisible).toBe(true);

    const closeCall = withTimingCalls[withTimingCalls.length - 1];
    expect(closeCall.toValue).toBe(0);
    act(() => {
      closeCall.callback?.(true);
    });
    expect(latestModalVisible).toBe(false);
  });

  // Reveal-doesn't-replay, close-side analog of sheetAnimation.ts's own documented open-side bug: a
  // stale close callback firing after a reopen must not hide the reopened sheet.
  it("does not hide a reopened sheet when a stale close callback fires after reopening", () => {
    let root!: TestRenderer.ReactTestRenderer;
    act(() => {
      root = TestRenderer.create(<Harness visible={true} onClose={() => {}} />);
    });

    act(() => {
      root.update(<Harness visible={false} onClose={() => {}} />);
    });
    const staleCloseCall = withTimingCalls[withTimingCalls.length - 1];
    expect(latestModalVisible).toBe(true);

    // Reopen before the close animation's callback ever fires.
    act(() => {
      root.update(<Harness visible={true} onClose={() => {}} />);
    });
    expect(latestModalVisible).toBe(true);

    // The stale close animation was interrupted by the reopen's own pos.value reassignment --
    // Reanimated's real withTiming fires an interrupted animation's callback with finished: false.
    act(() => {
      staleCloseCall.callback?.(false);
    });
    expect(latestModalVisible).toBe(true);
  });

  // Mirrors the exact invariant useSheetAnim's own suite pinned on the open side (a sheet mounted
  // already-`visible` -- CafeSheet's `cafeSheetLoc`/`cafeSheetVisible` set in the same handler --
  // must still start its reveal from closed, not skip straight to open). Not just "cancelAnimation
  // was called" -- the actual reveal-to-1 animation must follow it, on the very first render.
  it("a sheet mounted already-visible still cancels first and reveals via a real 0 -> 1 animation", () => {
    act(() => {
      TestRenderer.create(<Harness visible={true} onClose={() => {}} />);
    });
    expect(cancelAnimationSpy).toHaveBeenCalledTimes(1);
    expect(withTimingCalls.map((c) => c.toValue)).toContain(1);
  });
});

// #245/motion tokens: the open/close tween must carry the spec's duration (300, not the old 220)
// AND its cubic-bezier easing (`.sheet` in Prototype.dc.html was always eased -- this hook simply
// never set one before). Reading `config` off the recorder (not just `toValue`, which every other
// test in this file already covers) is what makes this actually pin something new.
describe("useDraggableSheet motion tokens (durations.sheet)", () => {
  it("opens with durations.sheet and the shared pane curve", () => {
    act(() => {
      TestRenderer.create(<Harness visible={true} onClose={() => {}} />);
    });
    const openCall = withTimingCalls.find((c) => c.toValue === 1);
    expect(openCall?.config?.duration).toBe(durations.sheet);
    expect(openCall?.config?.easing).toBe(reanimatedPaneCurve);
  });

  it("closes with a settleDuration(durations.sheet) and the shared pane curve", () => {
    // Not a flat durations.sheet: closeSheet runs settleDuration(from, 0, durations.sheet), same
    // as every settle call elsewhere in the app -- and the mocked useSharedValue (unlike real
    // Reanimated) re-inits to 0 on every React re-render rather than persisting like a ref, so
    // `from` reads back as 0 here regardless of what the open animation set it to. That still
    // exercises the real settleDuration/durations.sheet wiring end to end, just at the 40% floor
    // this particular from/to pair lands on -- see paneStack.test.tsx's own settleDuration tests
    // for the "from actually reflects live drag position" case, which doesn't hit this mock quirk
    // because it never round-trips through a React re-render.
    let root!: TestRenderer.ReactTestRenderer;
    act(() => {
      root = TestRenderer.create(<Harness visible={true} onClose={() => {}} />);
    });
    act(() => {
      root.update(<Harness visible={false} onClose={() => {}} />);
    });
    const closeCall = withTimingCalls.find((c) => c.toValue === 0);
    expect(closeCall?.config?.duration).toBe(settleDuration(0, 0, durations.sheet));
    expect(closeCall?.config?.easing).toBe(reanimatedPaneCurve);
  });
});

describe("useDraggableSheet handle drag", () => {
  function renderGestureHarness(onClose: () => void) {
    let root!: TestRenderer.ReactTestRenderer;
    act(() => {
      root = TestRenderer.create(<Harness visible={true} onClose={onClose} />);
    });
    function gesture(): GestureType {
      return root.root.findByType(GestureDetector).props.gesture as GestureType;
    }
    return { gesture, root };
  }

  it("calls onClose once the drag clears SHEET_DISMISS_PX", () => {
    const onClose = jest.fn();
    const { gesture } = renderGestureHarness(onClose);

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(SHEET_DISMISS_PX + 20));
    });
    act(() => {
      gesture().handlers.onEnd?.(panEvent(SHEET_DISMISS_PX + 20), true);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on a fast downward flick well short of SHEET_DISMISS_PX", () => {
    const onClose = jest.fn();
    const { gesture } = renderGestureHarness(onClose);

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(10, SHEET_FLING_VELOCITY + 100));
    });
    act(() => {
      gesture().handlers.onEnd?.(panEvent(10, SHEET_FLING_VELOCITY + 100), true);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // The reported bug: onEnd used to only call onClose and wait for the parent's setState to round
  // trip back into a `visible={false}` prop before the close withTiming ever started -- freezing the
  // panel wherever the finger released it. The close must start on the UI thread from onEnd itself.
  it("starts the close animation immediately on a committed dismiss, without waiting for onClose's round trip", () => {
    const onClose = jest.fn();
    const { gesture } = renderGestureHarness(onClose);

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(SHEET_DISMISS_PX + 20));
    });
    act(() => {
      gesture().handlers.onEnd?.(panEvent(SHEET_DISMISS_PX + 20), true);
    });

    expect(withTimingCalls.some((c) => c.toValue === 0)).toBe(true);
  });

  it("snaps back open (no onClose) when the drag falls short of both thresholds", () => {
    const onClose = jest.fn();
    const { gesture } = renderGestureHarness(onClose);

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(20));
    });
    const callsBeforeEnd = withTimingCalls.length;
    act(() => {
      gesture().handlers.onEnd?.(panEvent(20, 0), true);
    });

    expect(onClose).not.toHaveBeenCalled();
    const settleCalls = withTimingCalls.slice(callsBeforeEnd);
    expect(settleCalls.some((c) => c.toValue === 1)).toBe(true);
  });

  it("snaps back open instead of closing when the gesture is cancelled mid-drag (success === false)", () => {
    const onClose = jest.fn();
    const { gesture } = renderGestureHarness(onClose);

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(SHEET_DISMISS_PX + 50)); // well past the commit distance
    });
    const callsBeforeEnd = withTimingCalls.length;
    act(() => {
      gesture().handlers.onEnd?.(panEvent(SHEET_DISMISS_PX + 50), false);
    });

    expect(onClose).not.toHaveBeenCalled();
    const settleCalls = withTimingCalls.slice(callsBeforeEnd);
    expect(settleCalls.some((c) => c.toValue === 1)).toBe(true);
  });

  it("does not drag the panel past fully open on an upward (negative) drag", () => {
    // Documented via the clamp's absence of any thrown/NaN behavior -- onUpdate must not crash or
    // produce a pos outside [0, 1] on a drag that overshoots past open.
    const onClose = jest.fn();
    const { gesture } = renderGestureHarness(onClose);
    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    expect(() => {
      act(() => {
        gesture().handlers.onUpdate?.(panEvent(-500));
      });
    }).not.toThrow();
  });

  // The double-invocation this hook's own fix relies on: onEnd starts closeSheet on the UI thread
  // immediately, AND still calls onClose, whose parent setState eventually flips the `visible` prop
  // and re-runs the effect, which calls closeSheet again. Confirms this doesn't race: the first
  // (interrupted) call's callback must be a no-op, and modalVisible must flip false exactly once,
  // from whichever call's callback actually finishes.
  it("closeSheet fires from both onEnd and the subsequent visible=false re-render without racing modalVisible", () => {
    const onClose = jest.fn(() => {
      act(() => {
        root.update(<Harness visible={false} onClose={onClose} />);
      });
    });
    const { gesture, root } = renderGestureHarness(onClose);

    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    act(() => {
      gesture().handlers.onUpdate?.(panEvent(SHEET_DISMISS_PX + 20));
    });
    act(() => {
      // onClose (called from onEnd) synchronously re-renders with visible=false above, so by the
      // time this act() flushes, both closeSheet call sites have already fired.
      gesture().handlers.onEnd?.(panEvent(SHEET_DISMISS_PX + 20), true);
    });

    const closeCalls = withTimingCalls.filter((c) => c.toValue === 0);
    expect(closeCalls).toHaveLength(2);
    expect(latestModalVisible).toBe(true); // neither callback has fired yet

    // The first (onEnd-started) close was interrupted by the effect's own cancelAnimation -- a real
    // withTiming fires an interrupted animation's callback with finished: false.
    act(() => {
      closeCalls[0].callback?.(false);
    });
    expect(latestModalVisible).toBe(true);

    act(() => {
      closeCalls[1].callback?.(true);
    });
    expect(latestModalVisible).toBe(false);
  });
});
