import { useEffect, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { PaneHeader } from "./PaneHeader";
import { PANE_COUNT, paneDragPosition, paneIndexForSwipe, paneOffsetRange, paneVisibility, settleDuration } from "../lib/paneShell";
import { durations, reanimatedPaneCurve } from "../lib/motion";
import { colors, fs } from "../lib/theme";

const PANE_OFFSET = fs(36);

const HORIZONTAL_DOMINANCE_PX = 10;

/** One stacked pane -- its own component, not an inline .map() callback, since useAnimatedStyle
 * is a hook and calling it inside a .map() callback is the wrong shape to rely on. */
function StackedPane({
  pane,
  index,
  activeIndex,
  panePos,
  paneOpacityPos,
}: {
  pane: ReactNode;
  index: number;
  activeIndex: number;
  panePos: ReturnType<typeof useSharedValue<number>>;
  paneOpacityPos: ReturnType<typeof useSharedValue<number>>;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(panePos.value, [index - 1, index, index + 1], paneOffsetRange(PANE_OFFSET), Extrapolation.CLAMP),
      },
    ],
    opacity: interpolate(paneOpacityPos.value, [index - 1, index, index + 1], [0, 1, 0], Extrapolation.CLAMP),
  }));
  const { zIndex, pointerEvents } = paneVisibility(index, activeIndex);
  return (
    <Animated.View
      key={index}
      pointerEvents={pointerEvents}
      renderToHardwareTextureAndroid={true}
      style={[styles.pane, { zIndex }, style]}
    >
      {pane}
    </Animated.View>
  );
}

/**
 * The shared-axis pane shell: panes are stacked (position absolute, full screen) instead of a
 * translating strip. `d = j - activePane` drives each pane's translateX/opacity via two Reanimated
 * shared values (transform and opacity animate on separate curves/durations, so they're separate
 * values). z-index and pointer-events are read straight off `activeIndex`, not the animated
 * position, so a still-animating-out pane never keeps eating touches meant for the incoming one.
 *
 * PaneHeader is mounted here exactly once, stacked above the panes via z-index -- it must never
 * re-render inside the per-pane loop, which would desync its animated values.
 *
 * Both shared values start at activeIndex, not 0, to avoid a first-frame flash of the wrong pane.
 *
 * The commit target is discrete (±1 pane, clamped), but the animated position tracks the drag
 * continuously via `paneDragPosition`, settling to the committed index on release. `panePos`/
 * `paneOpacityPos` are also handed to PaneHeader so its title crossfade tracks the same drag (the
 * dot morph stays commit-only -- it animates via plain RN `Animated`, which can't share a
 * UI-thread-driven Reanimated value with the panes).
 *
 * Uses react-native-gesture-handler's Gesture.Pan() driving Reanimated shared values, so drag
 * position updates on the UI thread with no JS round trip per frame. The Gesture.Pan() object is
 * rebuilt fresh every render -- RNGH's docs warn against memoizing/ref-caching a gesture object
 * across renders. `dragStartIndex` is a useSharedValue since it must survive a single gesture's
 * begin/update/end sequence, readable from the worklets these callbacks compile to.
 */
export function PaneStack({
  panes,
  activeIndex,
  onActiveIndexChange,
  topInset,
}: {
  panes: ReactNode[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  topInset: number;
}) {
  const panePos = useSharedValue(activeIndex);
  const paneOpacityPos = useSharedValue(activeIndex);
  const dragStartIndex = useSharedValue(activeIndex);

  useEffect(() => {
    panePos.value = withTiming(activeIndex, { duration: durations.pane, easing: reanimatedPaneCurve });
    paneOpacityPos.value = withTiming(activeIndex, { duration: durations.paneFade, easing: Easing.ease });
    // panePos/paneOpacityPos are stable useSharedValue identities; listed so this effect only
    // re-fires on a real activeIndex commit, not on every render.
  }, [activeIndex, panePos, paneOpacityPos]);

  // Worklet, runs on the UI thread. `from` scales the duration by how much of the pane-step is
  // actually left to animate -- a release near the commit edge has little visual distance left and
  // shouldn't take the same duration as a fast flick released early.
  function settlePosition(target: number, from: number = target) {
    "worklet";
    panePos.value = withTiming(target, { duration: settleDuration(from, target, durations.pane), easing: reanimatedPaneCurve });
    paneOpacityPos.value = withTiming(target, { duration: settleDuration(from, target, durations.paneFade), easing: Easing.ease });
  }

  // Cancels any settle still in flight from the previous gesture so onUpdate's assignment below
  // isn't fighting a running animation. Its own named worklet (not inlined) so it reads the
  // current cancelAnimation export fresh, rather than baking it into the gesture's build-time
  // closure the way an inline arrow would.
  function cancelInFlightSettle() {
    "worklet";
    cancelAnimation(panePos);
    cancelAnimation(paneOpacityPos);
  }

  const pan = Gesture.Pan()
    // Activates past 10px of horizontal travel; RNGH's native arbitration then resolves
    // vertical-scroll-vs-horizontal-swipe conflicts on its own. A failOffsetY counterpart was
    // tried and dropped -- it fails the gesture permanently past 10px of vertical travel
    // regardless of how large the horizontal drag grows afterward.
    .activeOffsetX([-HORIZONTAL_DOMINANCE_PX, HORIZONTAL_DOMINANCE_PX])
    // onStart (fires once activeOffsetX is crossed), not onBegin -- onBegin fires on every
    // touch-down before recognition, which would cancel the in-flight settle on a tap or vertical
    // scroll too, with no onEnd ever firing to restore it (onEnd only fires from ACTIVE).
    .onStart(() => {
      dragStartIndex.value = activeIndex;
      cancelInFlightSettle();
    })
    .onUpdate((e) => {
      // PANE_COUNT passed explicitly, not left to paneDragPosition's own default parameter -- a
      // default expression referencing a module-scope const evaluates in paneDragPosition's own
      // worklet scope, which doesn't automatically close over identifiers only referenced there.
      const dragPos = paneDragPosition(dragStartIndex.value, e.translationX, PANE_COUNT);
      panePos.value = dragPos;
      paneOpacityPos.value = dragPos;
    })
    .onEnd((e, success) => {
      if (!success) {
        // Cancelled/terminated mid-drag (e.g. a parent gesture/navigation stealing it) -- settle
        // back to where the drag started instead of stranding the pane at a fractional offset.
        settlePosition(dragStartIndex.value, paneDragPosition(dragStartIndex.value, e.translationX, PANE_COUNT));
        return;
      }
      // velocityX lets a fast short flick commit even under the distance threshold.
      const next = paneIndexForSwipe(dragStartIndex.value, e.translationX, e.velocityX, PANE_COUNT);
      settlePosition(next, paneDragPosition(dragStartIndex.value, e.translationX, PANE_COUNT));
      if (next !== activeIndex) runOnJS(onActiveIndexChange)(next);
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.root}>
        {panes.map((pane, j) => (
          <StackedPane key={j} pane={pane} index={j} activeIndex={activeIndex} panePos={panePos} paneOpacityPos={paneOpacityPos} />
        ))}
        <PaneHeader
          activeIndex={activeIndex}
          onSelectPane={onActiveIndexChange}
          topInset={topInset}
          titlePos={panePos}
          titleOpacityPos={paneOpacityPos}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream100 },
  pane: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.cream100 },
});
