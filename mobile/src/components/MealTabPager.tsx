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
} from "react-native-reanimated";
import { paneDragPosition, paneIndexForSwipe, paneOffsetRange, paneVisibility, settleDuration } from "../lib/paneShell";
import { colors, fs } from "../lib/theme";

// Same cubic-bezier PaneStack.tsx uses for its own pane transform -- one shared "how a pane
// crossfades" feel across the app, not a second curve to keep in sync by hand. Smaller offset than
// PaneStack's full-screen 36px (fs(36)): this pager's panes are the tab content area only, not a
// whole screen, so a smaller lateral shift reads proportionate.
const PANE_CURVE = Easing.bezier(0.22, 0.61, 0.36, 1);
const PANE_OFFSET = fs(24);

// isHorizontalSwipe's own dominance threshold (10px), reused here so the gesture-handler dominance
// gate matches the original PanResponder-era feel instead of an unrelated new constant.
const HORIZONTAL_DOMINANCE_PX = 10;

/**
 * One windowed pane -- its own component (not an inline `.map()` callback in MealTabPager's body)
 * because `useAnimatedStyle` is a hook: with a variable `panes.length` (1-5 tabs) and windowing that
 * skips all but ~3 indices, calling it directly inside the parent's `.map()` would vary the hook
 * count render to render. A sibling instance per pane sidesteps that -- each one follows the rules
 * of hooks on its own.
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
      style={[styles.pane, { zIndex }, style]}
    >
      {pane}
    </Animated.View>
  );
}

/**
 * Swipeable, crossfading tab pager for the hall/café menu screen's meal tabs (Breakfast / Lunch /
 * Dinner / Late Night / Grab 'N Go). Deliberately a sibling of `PaneStack.tsx`, not a reuse of it:
 * `PaneStack` is coupled to `PaneHeader`'s title-dot chrome (Home/Events/You specific), which this
 * screen doesn't want -- its tab row above already renders labels and its own underline, driven off
 * the committed `activeIndex`/`onActiveIndexChange`, not live-tracked during the drag (matching
 * `PaneHeader`'s own dot morph, which is commit-only for the same reason: it can't share a
 * native-driven value with the panes' transform/opacity).
 *
 * The gesture math itself (`Gesture.Pan()` wiring, shared values, commit/settle) is copied from
 * `PaneStack.tsx`'s established pattern rather than duplicated by hand from scratch -- but the tuned
 * constants and thresholds (`SWIPE_COMMIT_PX`, `PANE_DRAG_PX`, fling velocity, settle-duration curve)
 * stay single-sourced in `lib/paneShell.ts`, now generalized to take this pager's own `panes.length`
 * instead of always assuming the Home shell's 3.
 *
 * Migrated off `PanResponder` to `react-native-gesture-handler`'s `Gesture.Pan()` (native gesture
 * recognition/arbitration instead of JS-thread responder negotiation) driving `react-native-
 * reanimated` shared values (so the drag position updates on the UI thread, not via a JS round trip
 * per touch-move frame -- see PaneStack.tsx's own doc for why plain gesture-handler alone, without
 * Reanimated, doesn't get there). The `Gesture.Pan()` object is rebuilt fresh every render (RNGH's
 * own documented pattern -- their docs explicitly warn against memoizing/ref-caching a gesture
 * object across renders, since that reintroduces exactly the stale-closure bug a `useRef`-once
 * `PanResponder` had) rather than ported forward via the old `countRef`/`onActiveIndexChangeRef`
 * indirection: `count`, `activeIndex`, and `onActiveIndexChange` are just closed over directly, and
 * a fresh render always means a fresh, correctly-scoped closure. `dragStartIndex` is the one piece
 * of state that genuinely needs to survive across a single gesture's begin/update/end -- that's a
 * `useSharedValue`, readable from the worklets these callbacks compile to.
 *
 * Windowed to `activeIndex ± 1` (renders `null` for anything further away): every mounted pane here
 * is a real `SectionList` doing real filtering, not lightweight screen chrome, and `paneDragPosition`
 * already guarantees the animated position -- and therefore anything a crossfade could ever visually
 * reveal -- never leaves that same ±1 neighborhood. This is also what keeps the Grab tab's lazy fetch
 * lazy end-to-end: its pane stays fully unmounted (not just inactive) until the user is on Late Night
 * or Grab itself.
 */
export function MealTabPager({
  panes,
  activeIndex,
  onActiveIndexChange,
}: {
  panes: ReactNode[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
}) {
  const count = panes.length;
  const panePos = useSharedValue(activeIndex);
  const paneOpacityPos = useSharedValue(activeIndex);
  // The one piece of state that must survive across a single gesture's onStart -> onUpdate -> onEnd
  // sequence, which can span a re-render (the Gesture.Pan() object below is rebuilt every render --
  // see this component's own doc comment -- but a shared value's identity, like a ref's, persists
  // across that rebuild).
  const dragStartIndex = useSharedValue(activeIndex);
  // Tracks this effect's own "where did the animated position last land" -- separate from
  // `activeIndex` itself. Needed to tell an adjacent commit (swipe, or a single-step tab tap) from a
  // multi-hop one (tapping a non-adjacent tab): a continuous tween only ever passes through index
  // values whose panes are guaranteed mounted when the jump is ±1 (paneDragPosition's own ±1 clamp;
  // windowing mounts activeIndex ± 1). A jump of more than 1 sweeps the SHARED animated position
  // through pane indices outside that window -- panes that are either unmounted (nothing to show, a
  // blank flash) or briefly mounted-then-unmounted at the wrong moment (an unrelated tab's real
  // content flashing fully visible mid-transition, since its own opacity interpolate peaks at 1
  // exactly where the sweep passes through its index). Real swipes can never trigger this (the
  // shared engine only ever commits ±1), so this only matters for a tab tap more than one tab away
  // -- seed the position directly instead of tweening through panes that were never meant to be
  // seen. Plain ref (not a shared value): only ever read/written from this JS-thread effect, never
  // from a worklet.
  const committedIndexRef = useRef(activeIndex);

  useEffect(() => {
    const from = committedIndexRef.current;
    if (Math.abs(activeIndex - from) > 1) {
      panePos.value = activeIndex;
      paneOpacityPos.value = activeIndex;
    } else {
      panePos.value = withTiming(activeIndex, { duration: 340, easing: PANE_CURVE });
      paneOpacityPos.value = withTiming(activeIndex, { duration: 260, easing: Easing.ease });
    }
    committedIndexRef.current = activeIndex;
    // panePos/paneOpacityPos are stable useSharedValue identities; listed so this effect only
    // re-fires on a real activeIndex commit, not on every render.
  }, [activeIndex, panePos, paneOpacityPos]);

  // Worklet (runs on the UI thread from the gesture callbacks below, and directly as plain JS when
  // called nowhere else needs it) -- mirrors PaneStack.tsx's identical helper.
  function settlePosition(target: number, from: number = target) {
    "worklet";
    panePos.value = withTiming(target, { duration: settleDuration(from, target, 340), easing: PANE_CURVE });
    paneOpacityPos.value = withTiming(target, { duration: settleDuration(from, target, 260), easing: Easing.ease });
  }

  const pan = Gesture.Pan()
    .enabled(count > 1)
    // Native equivalent of the old `onMoveShouldSetPanResponder`'s `isHorizontalSwipe` dominance
    // check: activates only past 10px of horizontal travel -- gesture ARBITRATION happens natively
    // now instead of a per-move JS decision, unlike PanResponder. Deliberately NOT the exact same
    // formula (`isHorizontalSwipe` is `|dx| > 10 && |dx| > |dy|`, a diagonal-dominance test --
    // `activeOffsetX` alone is a plain horizontal-distance threshold, slightly narrower for a
    // sharply diagonal drag): a `failOffsetY` counterpart was tried and dropped, since it fails the
    // gesture permanently past 10px of vertical travel regardless of how large `dx` grows
    // afterward, which is stricter than the old dominance check ever was. `activeOffsetX` alone
    // already lets RNGH's own native arbitration resolve the vertical-scroll-vs-horizontal-swipe
    // conflict (a pane's SectionList only starts scrolling once ITS OWN threshold is crossed; this
    // gesture doesn't activate until 10px of horizontal travel either, so a vertical scroll that
    // never accumulates 10px of horizontal drift never contests it).
    .activeOffsetX([-HORIZONTAL_DOMINANCE_PX, HORIZONTAL_DOMINANCE_PX])
    // `onStart` (fires on transition to ACTIVE, i.e. once `activeOffsetX` is actually crossed) is
    // the analog of `onPanResponderGrant` -- NOT `onBegin`. `onBegin` fires at BEGAN, on every
    // touch-down, before recognition -- capturing `dragStartIndex`/cancelling the in-flight settle
    // there would fire on every tab tap or vertical scroll too (anything that touches this View),
    // and since `onEnd` "will be called only if the handler was previously in the ACTIVE state"
    // (RNGH's own doc comment on `onEnd`), a touch that never activates would cancel a settle
    // animation with nothing to ever restore it (no onEnd fires to call `settlePosition` back).
    .onStart(() => {
      dragStartIndex.value = activeIndex;
      // A settle from the previous gesture (release/cancel) can still be in flight when a new drag
      // starts -- cancel it so onUpdate's assignment below isn't fighting a running animation.
      cancelAnimation(panePos);
      cancelAnimation(paneOpacityPos);
    })
    .onUpdate((e) => {
      const dragPos = paneDragPosition(dragStartIndex.value, e.translationX, count);
      panePos.value = dragPos;
      paneOpacityPos.value = dragPos;
    })
    .onEnd((e, success) => {
      if (!success) {
        // Cancelled/failed mid-drag (e.g. a parent gesture stole it) -- settle back to where the
        // drag started instead of stranding the pane at a fractional offset.
        settlePosition(dragStartIndex.value, paneDragPosition(dragStartIndex.value, e.translationX, count));
        return;
      }
      // velocityX: a fast short flick commits even under SWIPE_COMMIT_PX of travel (paneIndexForSwipe's
      // own doc) -- the biggest single source of the swipe reading as unresponsive was a quick
      // flick doing nothing at all because it never crossed the distance threshold.
      const next = paneIndexForSwipe(dragStartIndex.value, e.translationX, e.velocityX, count);
      settlePosition(next, paneDragPosition(dragStartIndex.value, e.translationX, count));
      if (next !== activeIndex) runOnJS(onActiveIndexChange)(next);
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Same background as PaneStack.tsx's own pane style -- without it, the outgoing pane's real
  // background (its own View/SectionList content) shows through the incoming pane's transparent gap
  // during the crossfade instead of a solid backdrop.
  pane: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.cream100 },
});
