import { useEffect, useRef, type ReactNode } from "react";
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
  type SharedValue,
} from "react-native-reanimated";
import { paneDragPosition, paneIndexForSwipe, paneOffsetRange, paneVisibility, settleDuration, tabUnderlineInsets } from "../lib/paneShell";
import { durations, reanimatedPaneCurve } from "../lib/motion";
import { colors, fs } from "../lib/theme";

// Smaller offset than PaneStack's full-screen 36px (fs(36)): this pager's panes are the tab
// content area only, not a whole screen, so a smaller lateral shift reads proportionate.
const PANE_OFFSET = fs(24);

// isHorizontalSwipe's own dominance threshold (10px), reused here so the gesture-handler dominance
// gate matches the original PanResponder-era feel instead of an unrelated new constant.
const HORIZONTAL_DOMINANCE_PX = 10;

/**
 * Its own component, not an inline .map() callback -- useAnimatedStyle is a hook, and with a
 * variable panes.length plus windowing, calling it inside the parent's .map() would vary the hook
 * count between renders.
 */
function MealTabPane({
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
  const active = index === activeIndex;
  const { zIndex, pointerEvents } = paneVisibility(index, activeIndex);
  return (
    <Animated.View
      pointerEvents={pointerEvents}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      renderToHardwareTextureAndroid={true}
      style={[styles.pane, { zIndex }, style]}
    >
      {pane}
    </Animated.View>
  );
}

/**
 * Swipeable, crossfading tab pager for the hall/café menu screen's meal tabs. Sibling of
 * PaneStack.tsx, not a reuse of it -- PaneStack is coupled to PaneHeader's title-dot chrome, which
 * this screen doesn't want; its tab row renders its own labels/underline off the committed
 * activeIndex, not live-tracked during drag.
 *
 * Gesture math (Gesture.Pan() wiring, shared values, commit/settle) follows PaneStack.tsx's
 * pattern; tuned constants stay single-sourced in lib/paneShell.ts, generalized to this pager's
 * own panes.length.
 *
 * Uses react-native-gesture-handler's Gesture.Pan() driving Reanimated shared values so drag
 * position updates on the UI thread. The Gesture.Pan() object is rebuilt every render -- RNGH's
 * docs warn against memoizing/ref-caching a gesture object across renders.
 *
 * Windowed to activeIndex ± 1 (renders null further away): every mounted pane is a real
 * SectionList doing real filtering, and paneDragPosition guarantees the animated position never
 * leaves that neighborhood. This also keeps the Grab tab's lazy fetch unmounted until nearby.
 */
export function MealTabPager({
  panes,
  activeIndex,
  onActiveIndexChange,
  instantRef,
  panePos: externalPanePos,
}: {
  panes: ReactNode[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  /** One-shot flag set true right before a programmatic activeIndex change that should land
   * without a tween (not a real swipe). Consumed (reset false) by the next commit. A ref so
   * setting it doesn't itself trigger a re-render. */
  instantRef?: { current: boolean };
  /** Optional shared value the caller also reads this pager's live drag/settle position from, to
   * animate something else (e.g. a tab underline) in lockstep. Created here as a fallback via an
   * unconditional hook call so hook order stays stable whether or not a caller passes one. */
  panePos?: SharedValue<number>;
}) {
  const count = panes.length;
  const ownPanePos = useSharedValue(activeIndex);
  const panePos = externalPanePos ?? ownPanePos;
  const paneOpacityPos = useSharedValue(activeIndex);
  // Must survive across a single gesture's onStart -> onUpdate -> onEnd, which can span a
  // re-render (the Gesture.Pan() object is rebuilt every render, but a shared value's identity
  // persists across that).
  const dragStartIndex = useSharedValue(activeIndex);
  // Tracks where the animated position last landed, for this effect's instant-vs-tween decision.
  // A plain useRef, not a shared value -- this repo's Reanimated Jest mock re-derives .value from
  // the current activeIndex argument on every render, which would make "did a gesture already
  // commit this" ambiguous; real Reanimated shared values persist like a ref, but nothing here
  // should depend on that.
  //
  // Written eagerly from two places: commitActiveIndex (below) writes it the instant a gesture's
  // onEnd reports a commit, in the same call that triggers onActiveIndexChange, so rapid gesture
  // commits stay caught up even if React coalesces intermediate activeIndex renders. This effect's
  // own trailing write covers the other commit path -- a tab tap or the instant auto-correct.
  const committedIndexRef = useRef(activeIndex);
  // JS-thread only. The single place a gesture's commit reaches onActiveIndexChange, so this ref
  // and the caller's activeIndex update happen from the same synchronous call, however fast
  // commits arrive.
  function commitActiveIndex(next: number) {
    committedIndexRef.current = next;
    onActiveIndexChange(next);
  }

  useEffect(() => {
    const from = committedIndexRef.current;
    const instant = instantRef?.current === true;
    if (instant) instantRef!.current = false;
    // A swipe's onEnd already recorded this activeIndex in committedIndexRef and started settling
    // panePos/paneOpacityPos itself -- if that commit is what triggered this render, `from` already
    // equals `activeIndex` and a second withTiming here would retarget the same shared value from
    // a different starting point mid-flight. Only a tab tap or the instant auto-correct (neither
    // goes through onEnd) still needs this effect to animate.
    if (!instant && from === activeIndex) return;
    if (instant || Math.abs(activeIndex - from) > 1) {
      panePos.value = activeIndex;
      paneOpacityPos.value = activeIndex;
    } else {
      panePos.value = withTiming(activeIndex, { duration: durations.pane, easing: reanimatedPaneCurve });
      paneOpacityPos.value = withTiming(activeIndex, { duration: durations.paneFade, easing: Easing.ease });
    }
    committedIndexRef.current = activeIndex;
    dragStartIndex.value = activeIndex;
    // panePos/paneOpacityPos/instantRef identities are stable, so this only re-fires on a real
    // activeIndex commit.
  }, [activeIndex, panePos, paneOpacityPos, instantRef, dragStartIndex]);

  // Worklet -- runs on the UI thread from the gesture callbacks below.
  function settlePosition(target: number, from: number = target) {
    "worklet";
    panePos.value = withTiming(target, { duration: settleDuration(from, target, durations.pane), easing: reanimatedPaneCurve });
    paneOpacityPos.value = withTiming(target, { duration: settleDuration(from, target, durations.paneFade), easing: Easing.ease });
  }

  const pan = Gesture.Pan()
    .enabled(count > 1)
    // Activates past 10px of horizontal travel; RNGH's native arbitration then resolves
    // vertical-scroll-vs-horizontal-swipe conflicts on its own. A failOffsetY counterpart was
    // tried and dropped -- it fails the gesture permanently past 10px of vertical travel
    // regardless of how large the horizontal drag grows afterward.
    .activeOffsetX([-HORIZONTAL_DOMINANCE_PX, HORIZONTAL_DOMINANCE_PX])
    // onStart (fires once activeOffsetX is crossed), not onBegin -- onBegin fires on every
    // touch-down before recognition, which would cancel the in-flight settle on a tab tap or
    // vertical scroll too, with no onEnd ever firing to restore it (onEnd only fires from ACTIVE).
    .onStart(() => {
      // dragStartIndex isn't reseeded from the closed-over activeIndex prop here -- it can be one
      // render behind on a fast reversal (swipe, release, swipe again before the JS round trip
      // lands). It's kept authoritative by onEnd's eager write and by the effect above instead.
      //
      // A settle from the previous gesture can still be in flight when a new drag starts -- cancel
      // it so onUpdate isn't fighting a running animation.
      cancelAnimation(panePos);
      cancelAnimation(paneOpacityPos);
    })
    .onUpdate((e) => {
      const dragPos = paneDragPosition(dragStartIndex.value, e.translationX, count);
      panePos.value = dragPos;
      paneOpacityPos.value = dragPos;
    })
    // react-hooks/refs flags this because commitActiveIndex touches a ref, but the callback is
    // only invoked later by the native gesture runtime, never during render.
    // eslint-disable-next-line react-hooks/refs
    .onEnd((e, success) => {
      // This is the drag's true starting point regardless of whether the closed-over activeIndex
      // prop has caught up to it yet.
      const from = dragStartIndex.value;
      if (!success) {
        // Cancelled/failed mid-drag -- settle back to where the drag started instead of stranding
        // the pane at a fractional offset.
        settlePosition(from, paneDragPosition(from, e.translationX, count));
        return;
      }
      // velocityX lets a fast short flick commit even under the distance threshold.
      const next = paneIndexForSwipe(from, e.translationX, e.velocityX, count);
      settlePosition(next, paneDragPosition(from, e.translationX, count));
      // Eager UI-thread write -- the next gesture's onStart may begin before this commit's runOnJS
      // has round-tripped back to a re-render.
      dragStartIndex.value = next;
      // Compare against `from`, not the closed-over activeIndex prop, which can also be stale on a
      // fast reversal.
      if (next !== from) runOnJS(commitActiveIndex)(next);
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.root}>
        {panes.map((pane, j) => {
          if (Math.abs(j - activeIndex) > 1) return null;
          return <MealTabPane key={j} pane={pane} index={j} activeIndex={activeIndex} panePos={panePos} paneOpacityPos={paneOpacityPos} />;
        })}
      </View>
    </GestureDetector>
  );
}

/** Tab row's active-tab underline, tracking the same panePos MealTabPager uses for its pane
 * crossfade, so it moves with a swipe instead of snapping on commit. Renders once per tab,
 * absolutely positioned to fill that tab's underline slot. Shrink/draw-in math is
 * tabUnderlineInsets in paneShell.ts. */
export function AnimatedTabUnderline({ index, panePos }: { index: number; panePos: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const { left, right } = tabUnderlineInsets(panePos.value, index);
    return { left: `${left * 100}%`, right: `${right * 100}%` };
  });
  return <Animated.View style={[styles.underlineFill, style]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Without an explicit background, the outgoing pane shows through the incoming pane's
  // transparent gap during the crossfade.
  pane: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.cream100 },
  underlineFill: { position: "absolute", top: 0, bottom: 0, backgroundColor: colors.gold500, borderRadius: 2 },
});
