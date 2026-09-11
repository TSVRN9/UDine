import { useRef, type RefObject } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue, type SharedValue } from "react-native-reanimated";
import { dragContinuousIndex, servingsFromDrag } from "../lib/servingsStepper";
import { colors, fs, radii, withOpacity } from "../lib/theme";

/** A button's measured window position -- what the screen-level hold-slide overlay anchors to.
 * Measured fresh on every hold, not cached, since the row can scroll between renders. */
export interface ButtonAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  dishName: string;
  /** Fast path: a plain tap adds one serving immediately. Suppressed once a hold-and-drag activates. */
  onQuickAdd: () => void;
  onHoldStart: (anchor: ButtonAnchor) => void;
  /** Fires only when the snapped count changes, to update the overlay's count text -- the ladder
   * position itself stays on shared values for per-frame smoothness without a React re-render. */
  onHoldDrag: (count: number) => void;
  onHoldEnd: () => void;
  /** Written from the Pan gesture's UI-thread worklet on every touch-move, never bridged through a
   * JS callback -- crossing to JS on every frame was slow enough to visibly starve rendering. */
  liveCount: SharedValue<number>;
  liveIndex: SharedValue<number>;
  /** Refs to the hall screen's GestureSectionLists. Their scroll uses `disallowInterruption`, so
   * once it wins a touch it can't be pre-empted -- blocksExternalGesture makes LongPress wait for
   * scroll to fail first, resolved before the touch begins (a reactive `scrollEnabled` toggle is
   * too slow: it lands after scroll has often already won). */
  blocksScrollRefs: RefObject<any>[];
}

/** The hall-menu "+" add button. A quick tap adds one serving; holding past minDuration drags a
 * track (rendered as a screen-level overlay in [slug].tsx, not here, so it isn't clipped by the
 * SectionList's scroll bounds) to land on a half-serving count, or all the way down to cancel.
 * This component only owns gesture recognition and reports state up. */
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
  // Guards against Pressable's onPress also firing once a hold-and-drag has happened -- RN's own
  // press-retention cancellation doesn't always catch a hold with little to no drag.
  const suppressNextPress = useRef(false);
  // Gates the Pan gesture: it only starts intercepting touches once LongPress has fired, so an
  // ordinary scroll touch on this button is left alone until a deliberate hold begins.
  const longPressActive = useSharedValue(false);
  // The snapped count last sent to onHoldDrag, so it only fires on an actual change.
  const lastSentCount = useSharedValue<number | null>(null);

  function beginHold() {
    suppressNextPress.current = true;
    viewRef.current?.measureInWindow((x, y, width, height) => {
      onHoldStart({ x, y, width, height });
    });
  }

  function endHold() {
    onHoldEnd();
    suppressNextPress.current = false;
  }

  const longPress = Gesture.LongPress()
    .minDuration(220)
    .blocksExternalGesture(...blocksScrollRefs)
    .onStart(() => {
      longPressActive.value = true;
      // Always 1 -- this button only renders before anything's on the plate.
      liveCount.value = 1;
      liveIndex.value = dragContinuousIndex(1, 0);
      lastSentCount.value = null;
      runOnJS(beginHold)();
    });

  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_e, manager) => {
      // Only ACTIVATE, never fail, before longPressActive flips true -- manager.fail() here is a
      // TERMINAL state, so ordinary finger jitter during LongPress's window would strand Pan
      // (and onHoldEnd never fires). Leaving Pan pending lets it activate on a later move once
      // LongPress fires, or resolve not-successful on its own for a plain tap.
      if (longPressActive.value) manager.activate();
    })
    .onUpdate((e) => {
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

  // Not unit-testable: this Pan's manual activation reads a raw touch stream and a shared-value
  // flag set by a separate gesture, not a state transition fireGestureHandler can drive. The pure
  // math (servingsFromDrag, formatServings) is unit-tested; the gesture wiring needs a device.
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
