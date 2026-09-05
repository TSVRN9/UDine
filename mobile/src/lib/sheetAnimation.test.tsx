import { useEffect } from "react";
import { View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import type { GestureType, GestureUpdateEvent } from "react-native-gesture-handler";
import * as Reanimated from "react-native-reanimated";
import TestRenderer, { act } from "react-test-renderer";
import { SHEET_DISMISS_PX, SHEET_FLING_VELOCITY, shouldDismissSheet, useDraggableSheet } from "./sheetAnimation";

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
const withTimingCalls: { toValue: number; callback?: (finished?: boolean) => void }[] = [];
const withTimingSpy = jest
  .spyOn(Reanimated, "withTiming")
  .mockImplementation(((toValue: number, _config?: unknown, callback?: (finished?: boolean) => void) => {
    withTimingCalls.push({ toValue, callback });
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

describe("useDraggableSheet handle drag", () => {
  function renderGestureHarness(onClose: () => void) {
    let root!: TestRenderer.ReactTestRenderer;
    act(() => {
      root = TestRenderer.create(<Harness visible={true} onClose={onClose} />);
    });
    function gesture(): GestureType {
      return root.root.findByType(GestureDetector).props.gesture as GestureType;
    }
    return gesture;
  }

  it("calls onClose once the drag clears SHEET_DISMISS_PX", () => {
    const onClose = jest.fn();
    const gesture = renderGestureHarness(onClose);

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
    const gesture = renderGestureHarness(onClose);

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

  it("snaps back open (no onClose) when the drag falls short of both thresholds", () => {
    const onClose = jest.fn();
    const gesture = renderGestureHarness(onClose);

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
    const gesture = renderGestureHarness(onClose);

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
    const gesture = renderGestureHarness(onClose);
    act(() => {
      gesture().handlers.onStart?.(panEvent(0));
    });
    expect(() => {
      act(() => {
        gesture().handlers.onUpdate?.(panEvent(-500));
      });
    }).not.toThrow();
  });
});
