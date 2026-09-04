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
import { paneDragPosition, paneIndexForSwipe, paneOffsetRange, paneVisibility, settleDuration } from "../lib/paneShell";
import { colors, fs } from "../lib/theme";

// The artboard's own cubic-bezier for the pane transform (#179 styling spec).
const PANE_CURVE = Easing.bezier(0.22, 0.61, 0.36, 1);
const PANE_OFFSET = fs(36);

// isHorizontalSwipe's own dominance threshold (10px) -- see this file's own doc on why the native
// activeOffsetX/failOffsetY gate below replaces that manual JS check instead of calling it.
const HORIZONTAL_DOMINANCE_PX = 10;

/** One stacked pane -- its own component, not an inline `.map()` callback, because
 * `useAnimatedStyle` is a hook and PaneStack always renders a fixed `panes.length` (PANE_COUNT), but
 * calling a hook inside a `.map()` callback is still the wrong shape to rely on (see
 * MealTabPager.tsx's identical `MealTabPane` split, where the count genuinely does vary). */
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
    <Animated.View key={index} pointerEvents={pointerEvents} style={[styles.pane, { zIndex }, style]}>
      {pane}
    </Animated.View>
  );
}

/**
 * The shared-axis pane shell (#179, replaces the horizontal-ScrollView pager): panes are stacked
 * (position absolute, full screen) instead of a translating strip. `d = j - activePane` drives
 * each pane's translateX/opacity via two Reanimated shared values (transform and opacity animate on
 * separate curves/durations per the artboard spec, so they're separate values, not one). z-index
 * and pointer-events are read straight off `activeIndex` (paneVisibility, in lib/paneShell.ts) --
 * NOT off the animated position -- so a still-animating-out pane never keeps eating touches meant
 * for the incoming one.
 *
 * PaneHeader is mounted here exactly once, after the panes in JSX but stacked above them via its
 * own z-index -- it must never re-render inside the per-pane loop (see PaneHeader's own doc on why
 * that would desync its Animated.Values).
 *
 * Both shared values start AT activeIndex, not 0: the #f5f0d5b landing race (scrollTo firing
 * before native layout caught up, stranding the shell on Social) doesn't exist in this
 * ScrollView-free architecture, but the same *symptom* -- a first-frame flash of the wrong pane --
 * would reappear from a different cause (a shared value defaulting to 0 = Social) if these weren't
 * seeded correctly.
 *
 * Swipe (#245 item 2): the commit target is still discrete (±1 pane, clamped) -- the artboard's
 * transition curves are keyed to an integer activePane flip -- but the animated position now
 * tracks the drag continuously via `paneDragPosition` (dx / SWIPE_COMMIT_PX from the pane the
 * gesture started on), settling to the committed index with the decided motion (340ms transform /
 * 260ms opacity) on release. `panePos`/`paneOpacityPos` are also handed to PaneHeader so its title
 * crossfade tracks the same drag (the dot morph stays commit-only -- it animates
 * width/height/backgroundColor with plain RN `Animated`/`useNativeDriver: false`, which can't share
 * a UI-thread-driven Reanimated value with the panes' transform/opacity).
 *
 * Migrated off `PanResponder` to `react-native-gesture-handler`'s `Gesture.Pan()` driving
 * `react-native-reanimated` shared values: PanResponder's `onPanResponderMove` called
 * `panePos.setValue(...)` on every touch-move frame, a JS-thread round trip even though the
 * SETTLE animation already used `useNativeDriver: true` -- the live drag tracking itself never
 * did. Plain `react-native-gesture-handler` alone doesn't close that gap: its `Gesture.Pan()`
 * callbacks still run as ordinary JS-thread function calls unless they're worklets executed via
 * Reanimated's UI runtime, so gesture-handler-without-Reanimated only fixes the OTHER half of the
 * PanResponder problem (native gesture recognition/arbitration instead of JS-thread responder
 * negotiation) -- it doesn't get the per-frame value assignment off the JS thread. With Reanimated,
 * `onUpdate`'s callback compiles to a worklet and `panePos.value = ...` inside it runs on the UI
 * thread with no JS round trip per frame, which is what AC3 actually requires. (A legacy
 * `PanGestureHandler` component with `onGestureEvent={Animated.event(..., {useNativeDriver:
 * true})}` is also genuinely native-thread without Reanimated -- but that's the OLD gesture-handler
 * API, which exposes no such raw event prop on the new `Gesture.Pan()`/`GestureDetector` API this
 * migration is scoped to use.)
 *
 * The `Gesture.Pan()` object below is rebuilt fresh every render rather than cached in a `useRef`
 * (unlike the PanResponder it replaces) -- see MealTabPager.tsx's identical choice and its own doc
 * comment on why RNGH's own guidance is not to memoize a gesture object across renders.
 * `dragStartIndex` is the one piece of state that must survive across a single gesture's
 * begin/update/end sequence; a `useSharedValue` (readable from the worklets these callbacks compile
 * to) is the direct replacement for the old `dragStartIndex` ref.
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
    panePos.value = withTiming(activeIndex, { duration: 340, easing: PANE_CURVE });
    paneOpacityPos.value = withTiming(activeIndex, { duration: 260, easing: Easing.ease });
    // panePos/paneOpacityPos are stable useSharedValue identities; listed so this effect only
    // re-fires on a real activeIndex commit, not on every render.
  }, [activeIndex, panePos, paneOpacityPos]);

  // Worklet (runs on the UI thread from the gesture callbacks below). `from` (both gesture callers
  // below always pass the drag's actual last position; defaults to `target` only as a safe
  // fallback) scales the duration by how much of the pane-step is actually left to animate
  // (settleDuration) -- a release right at the SWIPE_COMMIT_PX edge has almost no visual distance
  // left (paneDragPosition already tracked it most of the way there) and shouldn't take the same
  // 340ms/260ms as a fast flick released early with nearly the whole step still to cover.
  function settlePosition(target: number, from: number = target) {
    "worklet";
    panePos.value = withTiming(target, { duration: settleDuration(from, target, 340), easing: PANE_CURVE });
    paneOpacityPos.value = withTiming(target, { duration: settleDuration(from, target, 260), easing: Easing.ease });
  }

  // A settle from the previous gesture (release/cancel) can still be in flight when a new drag
  // starts -- cancel it so onUpdate's assignment below isn't fighting a running animation. Its own
  // named worklet (not inlined into onStart below) for the same reason settlePosition is its own
  // function: a plain top-level `"worklet"` function calls through to the CURRENT `cancelAnimation`
  // export, where an inline arrow passed straight to a gesture builder method gets its free
  // variables captured into the gesture's closure at BUILD time (this render) -- fine for values,
  // but for a function reference it bakes in whatever `cancelAnimation` was AT BUILD TIME rather
  // than reading it fresh.
  function cancelInFlightSettle() {
    "worklet";
    cancelAnimation(panePos);
    cancelAnimation(paneOpacityPos);
  }

  const pan = Gesture.Pan()
    // Native equivalent of the old `onMoveShouldSetPanResponder`'s `isHorizontalSwipe` dominance
    // check: activates only past 10px of horizontal travel -- gesture ARBITRATION happens natively
    // now instead of a per-move JS decision, unlike PanResponder. Deliberately NOT the exact same
    // formula (`isHorizontalSwipe` is `|dx| > 10 && |dx| > |dy|`, a diagonal-dominance test --
    // `activeOffsetX` alone is a plain horizontal-distance threshold, slightly narrower for a
    // sharply diagonal drag): a `failOffsetY` counterpart was tried and dropped, since it fails the
    // gesture permanently past 10px of vertical travel regardless of how large `dx` grows
    // afterward, which is stricter than the old dominance check ever was. `activeOffsetX` alone
    // already lets RNGH's own native arbitration resolve the vertical-scroll-vs-horizontal-swipe
    // conflict (a pane's ScrollView only starts scrolling once ITS OWN threshold is crossed; this
    // gesture doesn't activate until 10px of horizontal travel either, so a vertical scroll that
    // never accumulates 10px of horizontal drift never contests it).
    .activeOffsetX([-HORIZONTAL_DOMINANCE_PX, HORIZONTAL_DOMINANCE_PX])
    // `onStart` (fires on transition to ACTIVE, i.e. once `activeOffsetX` is actually crossed) is
    // the analog of `onPanResponderGrant` -- NOT `onBegin`. `onBegin` fires at BEGAN, on every
    // touch-down, before recognition -- capturing `dragStartIndex`/cancelling the in-flight settle
    // there would fire on every tap or vertical scroll too (anything that touches this View),
    // and since `onEnd` "will be called only if the handler was previously in the ACTIVE state"
    // (RNGH's own doc comment on `onEnd`), a touch that never activates would cancel a settle
    // animation with nothing to ever restore it (no onEnd fires to call `settlePosition` back).
    .onStart(() => {
      dragStartIndex.value = activeIndex;
      cancelInFlightSettle();
    })
    .onUpdate((e) => {
      const dragPos = paneDragPosition(dragStartIndex.value, e.translationX);
      panePos.value = dragPos;
      paneOpacityPos.value = dragPos;
    })
    .onEnd((e, success) => {
      if (!success) {
        // Cancelled/terminated mid-drag (e.g. a parent gesture/navigation stealing it) -- settle
        // back to where the drag started instead of stranding the pane at a fractional offset.
        settlePosition(dragStartIndex.value, paneDragPosition(dragStartIndex.value, e.translationX));
        return;
      }
      // velocityX: a fast short flick commits even under SWIPE_COMMIT_PX of travel (paneIndexForSwipe's
      // own doc) -- the biggest single source of the swipe reading as unresponsive was a quick
      // flick doing nothing at all because it never crossed the distance threshold.
      const next = paneIndexForSwipe(dragStartIndex.value, e.translationX, e.velocityX);
      settlePosition(next, paneDragPosition(dragStartIndex.value, e.translationX));
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
