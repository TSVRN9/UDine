import { useCallback, useLayoutEffect, useState } from "react";
import { Gesture } from "react-native-gesture-handler";
import {
  cancelAnimation,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { settleDuration } from "./paneShell";
import { durations, reanimatedPaneCurve } from "./motion";

/** A released handle-drag past this many px of downward travel dismisses the sheet outright,
 * regardless of velocity. Flat, not proportional to `panelTravel` -- call sites pass their own
 * measured panel height (PlateSheet, HallInfoSheet, FilterSheet each pass their literal `maxHeight`;
 * CafeSheet doesn't use this hook at all), so a percentage would vary by caller. */
export const SHEET_DISMISS_PX = 100;

/** RNGH's `GestureUpdateEvent.velocityY` is in points per second, not per millisecond -- this is a
 * separate constant from `paneShell.ts`'s `SWIPE_FLING_VELOCITY` and must stay in those units. */
export const SHEET_FLING_VELOCITY = 500;

/** Accessibility props for whatever sits BEHIND an in-tree overlay sheet (PlateSheet renders inside
 * its caller's screen, not in an RN Modal -- see its keyboard-follow note). A Modal's Dialog window
 * took the screen behind it out of TalkBack/VoiceOver's navigation scope for free; a plain sibling
 * overlay does not, so the caller wraps its background content and spreads these -- the same
 * "visible-but-inert" pattern MealTabPager uses for its inactive panes. */
export function behindSheetA11yProps(sheetOpen: boolean) {
  return {
    accessibilityElementsHidden: sheetOpen,
    importantForAccessibility: sheetOpen ? ("no-hide-descendants" as const) : ("auto" as const),
  };
}

/** Pure release decision, mirroring `paneShell.ts`'s `paneIndexForSwipe` shape (distance OR
 * velocity commits) so this hook's `onEnd` reduces to one call instead of re-deriving the OR
 * inline. `"worklet"` so it can be called directly from the UI-thread gesture callback below. */
export function shouldDismissSheet(dragDownPx: number, velocityYPtsPerSec: number): boolean {
  "worklet";
  return dragDownPx >= SHEET_DISMISS_PX || velocityYPtsPerSec >= SHEET_FLING_VELOCITY;
}

/**
 * Shared drag+animate engine for the three house bottom sheets (PlateSheet, HallInfoSheet,
 * CafeSheet). RN's `<Modal visible={false}>` unmounts its children synchronously in the same commit
 * the caller flips `visible` (`Modal.js`'s `_shouldShowModal()`), so a JS-side close animation never
 * gets a frame to paint unless the Modal itself stays mounted through it.
 *
 * Fix: `modalVisible` (returned here, bound to the caller's `<Modal visible={...}>` instead of the
 * raw `visible` prop) is its own React state, delayed relative to `visible` -- it flips true the
 * instant `visible` does (open is immediate), but only flips back to false from `withTiming`'s own
 * completion callback on close, via `runOnJS`. That keeps the Modal mounted for the entire close
 * animation.
 *
 * The completion callback from an in-flight close `withTiming` can still fire after a reopen --
 * guarded by `finished`, since reassigning `pos.value` (as the open branch does) interrupts the
 * running animation and its callback then fires with `finished: false`, so a stale close callback
 * can't hide a sheet that's back open. `cancelAnimation` + forcing `pos.value` back to 0 before
 * animating open makes that interruption happen deterministically.
 *
 * The drag: `Gesture.Pan()` attaches only to each sheet's handle row (never the whole sheet or its
 * scrollable content). `onUpdate` follows the finger, clamped to `[0, panelTravel]`. `onEnd` calls
 * the caller's `onClose` once `shouldDismissSheet` commits (flowing through the same close animation
 * as a backdrop tap or hardware back button), or snaps back open otherwise -- including when the
 * gesture is cancelled/stolen mid-drag (`success === false`), so the panel never strands mid-drag.
 */
export function useDraggableSheet(visible: boolean, onClose: () => void, panelTravel = 400) {
  const pos = useSharedValue(0); // 0 = fully closed, 1 = fully open
  const dragStartPos: SharedValue<number> = useSharedValue(0);
  // Seeded from `visible`, not always false -- a sheet mounted already-visible (CafeSheet sets both
  // in the same handler) must show its Modal immediately, not wait a render for the effect below to
  // catch up.
  const [modalVisible, setModalVisible] = useState(visible);

  // Named worklet so the drag-dismiss path and the visible-prop-driven path share one
  // implementation. `from` has no default -- a default referencing captured `pos` would hit the
  // same worklet-closure bug paneShell.ts documents. Duration is scaled by remaining distance via
  // settleDuration. useCallback keeps this stable across renders so the effect below can list it as
  // a real dependency.
  const closeSheet = useCallback(
    (from: number) => {
      "worklet";
      cancelAnimation(pos);
      pos.value = withTiming(0, { duration: settleDuration(from, 0, durations.sheet), easing: reanimatedPaneCurve }, (finished) => {
        if (finished) runOnJS(setModalVisible)(false);
      });
    },
    [pos],
  );

  useLayoutEffect(() => {
    // useLayoutEffect, not useEffect, so the reset below lands before paint -- otherwise the sheet
    // would flash open-then-slide on a fast reopen instead of animating cleanly from closed.
    if (visible) {
      setModalVisible(true);
      cancelAnimation(pos);
      pos.value = 0;
      pos.value = withTiming(1, { duration: durations.sheet, easing: reanimatedPaneCurve });
    } else {
      closeSheet(pos.value);
    }
  }, [visible, pos, closeSheet]);

  const pan = Gesture.Pan()
    .onStart(() => {
      dragStartPos.value = pos.value;
    })
    .onUpdate((e) => {
      const startTravel = (1 - dragStartPos.value) * panelTravel;
      const travel = Math.max(0, Math.min(panelTravel, startTravel + e.translationY));
      pos.value = 1 - travel / panelTravel;
    })
    .onEnd((e, success) => {
      if (success && shouldDismissSheet(e.translationY, e.velocityY)) {
        // Start the close on the UI thread right now, rather than waiting for onClose's setState
        // to round-trip back into a `visible={false}` prop.
        closeSheet(pos.value);
        runOnJS(onClose)(); // still flip the parent's state, so backdrop/button closes stay on the same path
      } else {
        // Snap back open -- either the drag fell short of both thresholds, or the gesture was
        // cancelled/stolen mid-drag (success === false) and shouldn't strand the panel partway.
        pos.value = withTiming(1, { duration: settleDuration(pos.value, 1, durations.sheet), easing: reanimatedPaneCurve });
      }
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(pos.value, [0, 1], [panelTravel, 0], Extrapolation.CLAMP) }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: pos.value }));

  return { gesture: pan, panelStyle, backdropStyle, modalVisible };
}
