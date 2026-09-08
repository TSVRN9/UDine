import { useRef, type RefObject } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue, type SharedValue } from "react-native-reanimated";
import { dragContinuousIndex, servingsFromDrag } from "../lib/servingsStepper";
import { colors, fs, radii, withOpacity } from "../lib/theme";

/** A button's measured position in window coordinates -- what the screen-level hold-slide
 * overlay (rendered by the hall-menu screen, see [slug].tsx) anchors itself to. Measured fresh
 * on every hold, not cached, since the row this button lives in can scroll between renders. */
export interface ButtonAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  dishName: string;
  /** Fast path: a plain tap (no hold) adds one serving immediately -- the existing behavior,
   * unchanged. Suppressed if the long-press-and-drag path already activated for this touch. */
  onQuickAdd: () => void;
  onHoldStart: (anchor: ButtonAnchor) => void;
  /** Fires only when the snapped count actually changes (roughly once per DRAG_STEP_PX of
   * movement, not per touch-move frame) -- purely to update the overlay's count/label TEXT, which
   * doesn't need per-frame smoothness the way the ladder's position does. Routed by the hall
   * screen straight into HoldSlideHost's own small re-render scope via a ref call, never through
   * this component's own screen-level state -- see [slug].tsx's holdSlideHostRef doc comment for
   * why that distinction matters. */
  onHoldDrag: (count: number) => void;
  onHoldEnd: () => void;
  /** Written directly from the Pan gesture's UI-thread worklet on every touch-move -- never
   * bridged through a JS callback. The hall screen creates these once and reads liveCount's final
   * `.value` (a plain synchronous property read, safe from JS) at commit time in onHoldEnd; the
   * screen-level HoldSlideOverlay reads liveIndex continuously via useAnimatedStyle to paint the
   * live ladder position (including its cancel rung at the bottom), all without a single
   * React re-render during the drag itself. Earlier versions of this component crossed to JS on
   * every touch-move frame just to re-derive a value nothing then did anything with until it
   * changed -- slow enough on a real device to visibly starve rendering. */
  liveCount: SharedValue<number>;
  liveIndex: SharedValue<number>;
  /** Refs to the hall screen's two GestureSectionLists (createNativeWrapper-wrapped, so their
   * scroll is itself a native gesture with `disallowInterruption: true` -- see its own comment
   * in [slug].tsx). Without this relationship, confirmed on-device: any vertical movement on
   * this button gets recognized as a list scroll before LongPress's minDuration elapses --
   * disallowInterruption means that scroll then can't be pre-empted for the rest of the touch,
   * so LongPress never gets the chance to activate at all. blocksExternalGesture is a native-
   * level "wait for me to fail before you may start" relationship resolved before any touch
   * begins, which is what actually fixes it -- a reactive `scrollEnabled` toggle was tried
   * first and confirmed too slow (it only lands after the scroll gesture has often already won
   * the race). */
  // RNGH's GestureRef type isn't re-exported from the package root; a plain RefObject<any> is
  // structurally compatible with every shape it accepts (a native-wrapped component, a Gesture
  // object, or a raw handler tag).
  blocksScrollRefs: RefObject<any>[];
}

/** The hall-menu "+" add button (canvas: "F: inline vertical slide"). A quick tap keeps adding
 * exactly one serving, same as before this feature existed -- holding past minDuration is the
 * deliberate, precise path for landing on a half-serving count, dragging a track that grows out
 * of this exact button. Dragging all the way down past the smallest addable count reaches
 * CANCEL_SERVINGS (0) instead of landing on a value -- one axis, no separate cancel gesture to
 * discover. The track/scrim themselves are NOT rendered here: they're a screen-level overlay in
 * [slug].tsx, anchored to this button's
 * measured position (`onHoldStart`'s anchor) -- a row-local overlay would get clipped by the
 * SectionList's own scroll bounds for any row not near the very bottom of the list, and a scrim
 * can't be reliably z-index'd above content that lives inside a separate scrolling container in
 * React Native (no cross-boundary stacking context the way CSS z-index gives you on web). This
 * component only owns gesture recognition and reports state up. */
export function HoldSlideAddButton({
  dishName,
  onQuickAdd,
  onHoldStart,
  onHoldDrag,
  onHoldEnd,
  liveCount,
  liveIndex,
  blocksScrollRefs,
}: Props) {
  const viewRef = useRef<View>(null);
  // Guards Pressable's own onPress from ALSO firing once a hold-and-drag has happened -- RN's own
  // press-retention cancellation usually already prevents this for a real drag (the finger moves
  // well outside the button's bounds), but a hold with little to no drag (picking the very next
  // whole number) might stay within that retention window, so this is an explicit belt-and-braces
  // guard rather than relying on that RN internal being close enough to the button's own size.
  const suppressNextPress = useRef(false);
  // UI-thread flag the Pan gesture checks every touch-move: it only activates (and only then
  // starts intercepting touches from the SectionList's own scroll responder) once LongPress has
  // already fired. Before that, any touch-move on this button is left alone for the list to
  // scroll normally -- without this gate, a bare Gesture.Pan() on a small button inside a
  // scrollable list would compete with scrolling on every touch that starts here, not just a
  // deliberate hold.
  const longPressActive = useSharedValue(false);
  // The snapped count last sent across the bridge for the overlay's text -- see onHoldDrag's own
  // doc comment on why this crossing is throttled separately from the shared-value writes above.
  const lastSentCount = useSharedValue<number | null>(null);

  function beginHold() {
    suppressNextPress.current = true;
    viewRef.current?.measureInWindow((x, y, width, height) => {
      onHoldStart({ x, y, width, height });
    });
  }

  function endHold() {
    onHoldEnd();
    // Same touch sequence's press (if any) has already been dispatched by the time gesture-handler
    // fires onEnd, so this is safe to clear synchronously -- no artificial delay needed.
    suppressNextPress.current = false;
  }

  const longPress = Gesture.LongPress()
    .minDuration(220)
    .blocksExternalGesture(...blocksScrollRefs)
    .onStart(() => {
      longPressActive.value = true;
      // startCount is always 1 here, matching [slug].tsx's own hardcoded `dragStateRef.current =
      // { item, count: 1 }` on hold start -- this button only renders before anything's on the
      // plate, so a fresh hold always starts from zero servings there.
      liveCount.value = 1;
      liveIndex.value = dragContinuousIndex(1, 0);
      lastSentCount.value = null;
      runOnJS(beginHold)();
    });

  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_e, manager) => {
      // Only ACTIVATE, never fail, on a move that lands before longPressActive flips true --
      // pr-reviewer catch: onTouchesMove has no distance threshold (that's the point of manual
      // activation), so ordinary finger jitter during LongPress's 220ms window used to hit an
      // eager manager.fail() here, which is a TERMINAL state (confirmed by reading gesture-
      // handler's own state-manager source) -- Pan could never activate for the rest of that
      // touch even once LongPress went on to fire, leaving onHoldEnd uncalled: the overlay stuck
      // open and suppressNextPress stuck true (dead quick-tap on that row) until an unrelated
      // re-render. Doing nothing here just leaves Pan pending -- it activates on a later move
      // once longPressActive is true, or resolves not-successful on its own once all touches end
      // if LongPress never fired (a plain tap) -- no premature terminal state either way.
      if (longPressActive.value) manager.activate();
    })
    .onUpdate((e) => {
      // Pure UI-thread writes -- no runOnJS at all on this hot path (see the Props doc comment).
      const next = servingsFromDrag(1, e.translationY);
      liveCount.value = next;
      liveIndex.value = dragContinuousIndex(1, e.translationY);
      if (next !== lastSentCount.value) {
        lastSentCount.value = next;
        runOnJS(onHoldDrag)(next);
      }
    })
    .onEnd(() => {
      longPressActive.value = false;
      runOnJS(endHold)();
    })
    .onFinalize((_e, success) => {
      if (!success) {
        longPressActive.value = false;
        runOnJS(endHold)();
      }
    });

  // Not covered by an automated test: fireGestureHandler (react-native-gesture-handler/jest-utils)
  // simulates GestureStateChangeEvent/GestureUpdateEvent transitions, but this Pan's manual
  // activation happens inside onTouchesMove against a raw touch stream and a shared-value flag
  // set by a separate LongPress gesture -- not a state transition fireGestureHandler drives.
  // Mirrors the same class of limitation hit with MealTabPager's Jest reanimated mock earlier in
  // this feature (see hallMenuTabs.ts's shouldAutoCorrectMealTab doc comment): the pure math this
  // gesture drives (servingsFromDrag, formatServings) is fully unit-tested; the wiring itself
  // needs on-device verification, not a misleading unit test of internals the harness can't
  // actually exercise.
  const gesture = Gesture.Simultaneous(longPress, pan);

  return (
    <GestureDetector gesture={gesture}>
      <View ref={viewRef} collapsable={false}>
        <Pressable
          style={styles.addButton}
          onPress={() => {
            if (suppressNextPress.current) return;
            onQuickAdd();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Add ${dishName} to plate`}
        >
          <Text style={styles.addButtonText}>+</Text>
        </Pressable>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  addButton: {
    width: fs(44),
    height: fs(44),
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: withOpacity(colors.maroon600, 45),
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: { fontSize: fs(20), color: colors.maroon600, lineHeight: fs(22) },
});
