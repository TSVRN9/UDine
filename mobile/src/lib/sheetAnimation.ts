import { useLayoutEffect, useState } from "react";
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

const SHEET_DURATION = 220;

/** A released handle-drag past this many px of downward travel dismisses the sheet outright,
 * regardless of velocity. Flat, not proportional to `panelTravel` -- every call site (PlateSheet,
 * HallInfoSheet, CafeSheet) uses the default 400px travel, so a single tuned number is simpler than
 * a percentage that would need its own justification. Provisional pending an on-device feel pass
 * (see this PR's own body for what was actually verified). */
export const SHEET_DISMISS_PX = 100;

/** RNGH's `GestureUpdateEvent.velocityY` (and `velocityX`) are documented in points PER SECOND, not
 * per millisecond -- this is deliberately NOT `paneShell.ts`'s `SWIPE_FLING_VELOCITY` (0.5), which
 * that file's own doc comment says is calibrated for PanResponder's `gesture.vx`/`vy` (px/ms).
 * Reusing 0.5 here as a points/sec threshold would make almost any release read as a "fling" --
 * off by roughly three orders of magnitude. 500pt/s sits in the range common bottom-sheet libraries
 * default a fling threshold to; provisional pending an on-device feel pass, same as SHEET_DISMISS_PX
 * above. Do NOT fix paneShell.ts's own units mismatch here -- out of scope for this change (flagged
 * separately, not touched). */
export const SHEET_FLING_VELOCITY = 500;

/** Pure release decision, mirroring `paneShell.ts`'s `paneIndexForSwipe` shape (distance OR
 * velocity commits) so this hook's `onEnd` reduces to one call instead of re-deriving the OR
 * inline. `"worklet"` so it can be called directly from the UI-thread gesture callback below --
 * literal defaults only (none needed here), per `paneShell.ts`'s own documented reason a worklet
 * can't safely default a parameter to a captured module-scope identifier. */
export function shouldDismissSheet(dragDownPx: number, velocityYPtsPerSec: number): boolean {
  "worklet";
  return dragDownPx >= SHEET_DISMISS_PX || velocityYPtsPerSec >= SHEET_FLING_VELOCITY;
}

/**
 * Shared drag+animate engine for the three house bottom sheets (PlateSheet, HallInfoSheet,
 * CafeSheet) -- see those files' own doc comments for why their JSX/styling stays duplicated while
 * only this engine is shared. Replaces `useSheetAnim` (deleted once all three call sites migrated):
 * that hook's `Animated.timing` never got to paint a single frame on close, because RN's `<Modal
 * visible={false}>` unmounts its children SYNCHRONOUSLY in the same commit the caller flips
 * `visible` (see `Modal.js`'s `_shouldShowModal()`) -- `animationType="none"` supplies no native
 * fallback transition either, so the close was an instant snap regardless of what the JS-side
 * animation was doing.
 *
 * Fix: `modalVisible` (returned here, bound to the caller's `<Modal visible={...}>` INSTEAD of the
 * raw `visible` prop) is its own React state, delayed relative to `visible` -- it flips true the
 * instant `visible` does (so open is immediate), but only flips back to false from `withTiming`'s
 * own completion callback on close, via `runOnJS` (Reanimated animations run on the UI thread; a
 * `useState` setter must be called back on JS). That keeps the Modal's subtree mounted for the
 * entire close animation regardless of how fast the caller's own `visible` state changes.
 *
 * Reveal-doesn't-replay (the same failure mode `useSheetAnim`'s own doc described, on this hook's
 * close side instead): the completion callback captured by an in-flight close `withTiming` can still
 * fire after a reopen. Guarded by `finished` -- assigning `pos.value` a new target (as the open
 * branch below does, every time `visible` flips true) INTERRUPTS whatever animation was running on
 * it, and Reanimated's own `withTiming` callback fires with `finished: false` for an interrupted
 * animation -- so a stale close callback from a since-reopened sheet takes the `if (finished)` branch
 * never and can't hide a sheet that's back open. `cancelAnimation` + forcing `pos.value` back to 0
 * before animating open (mirroring `useSheetAnim`'s own "always force a real 0 -> 1" fix, and
 * PaneStack's `cancelInFlightSettle`) is what makes that interruption happen deterministically rather
 * than relying on `withTiming`'s own reassignment-cancels-previous behavior alone.
 *
 * The drag: `Gesture.Pan()` is built here but meant to be attached ONLY to each sheet's handle row
 * (never the whole sheet or its scrollable content) -- narrow enough that it never has to arbitrate
 * against a ScrollView the way PaneStack/#346 did for a different surface. `onUpdate` follows the
 * finger, clamped to `[0, panelTravel]` of downward travel (can't drag past fully open, can't drag
 * further than fully closed). `onEnd` calls the caller's `onClose` once `shouldDismissSheet` commits
 * (which then flows through the exact same close animation as a backdrop tap or hardware back
 * button) or snaps back open otherwise -- `success === false` (gesture cancelled/stolen, e.g. by a
 * parent nav gesture) also snaps back rather than stranding the panel mid-drag.
 */
export function useDraggableSheet(visible: boolean, onClose: () => void, panelTravel = 400) {
  const pos = useSharedValue(0); // 0 = fully closed, 1 = fully open
  const dragStartPos: SharedValue<number> = useSharedValue(0);
  // Seeded from `visible`, not always false -- a sheet mounted already-visible (CafeSheet's
  // `cafeSheetLoc`/`cafeSheetVisible` set in the same handler, per useSheetAnim's own doc) must show
  // its Modal immediately, not wait a render for the effect below to catch up.
  const [modalVisible, setModalVisible] = useState(visible);

  useLayoutEffect(() => {
    // useLayoutEffect, not useEffect, so the reset below lands before paint -- same reasoning as
    // useSheetAnim's own doc comment (and PaneStack's #336 comment it cites): otherwise the sheet
    // would flash open-then-slide on a fast reopen instead of animating cleanly from closed.
    if (visible) {
      setModalVisible(true);
      cancelAnimation(pos);
      pos.value = 0;
      pos.value = withTiming(1, { duration: SHEET_DURATION });
    } else {
      cancelAnimation(pos);
      pos.value = withTiming(0, { duration: SHEET_DURATION }, (finished) => {
        if (finished) runOnJS(setModalVisible)(false);
      });
    }
  }, [visible, pos]);

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
        runOnJS(onClose)();
      } else {
        // Snap back open -- either the drag fell short of both thresholds, or the gesture was
        // cancelled/stolen mid-drag (success === false) and shouldn't strand the panel partway.
        pos.value = withTiming(1, { duration: SHEET_DURATION });
      }
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(pos.value, [0, 1], [panelTravel, 0], Extrapolation.CLAMP) }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: pos.value }));

  return { gesture: pan, panelStyle, backdropStyle, modalVisible };
}
