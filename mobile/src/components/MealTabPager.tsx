import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, PanResponder, StyleSheet, View } from "react-native";
import { isHorizontalSwipe, paneDragPosition, paneIndexForSwipe, paneOffsetRange, paneVisibility, settleDuration } from "../lib/paneShell";
import { colors, fs } from "../lib/theme";

// Same cubic-bezier PaneStack.tsx uses for its own pane transform -- one shared "how a pane
// crossfades" feel across the app, not a second curve to keep in sync by hand. Smaller offset than
// PaneStack's full-screen 36px (fs(36)): this pager's panes are the tab content area only, not a
// whole screen, so a smaller lateral shift reads proportionate.
const PANE_CURVE = Easing.bezier(0.22, 0.61, 0.36, 1);
const PANE_OFFSET = fs(24);

/**
 * Swipeable, crossfading tab pager for the hall/café menu screen's meal tabs (Breakfast / Lunch /
 * Dinner / Late Night / Grab 'N Go). Deliberately a sibling of `PaneStack.tsx`, not a reuse of it:
 * `PaneStack` is coupled to `PaneHeader`'s title-dot chrome (Home/Events/You specific), which this
 * screen doesn't want -- its tab row above already renders labels and its own underline, driven off
 * the committed `activeIndex`/`onActiveIndexChange`, not live-tracked during the drag (matching
 * `PaneHeader`'s own dot morph, which is commit-only for the same reason: it can't share a
 * native-driven value with the panes' transform/opacity).
 *
 * The gesture math itself (PanResponder wiring, `Animated.Value`s, commit/settle) is copied from
 * `PaneStack.tsx`'s established pattern rather than duplicated by hand from scratch -- but the tuned
 * constants and thresholds (`SWIPE_COMMIT_PX`, `PANE_DRAG_PX`, fling velocity, settle-duration curve)
 * stay single-sourced in `lib/paneShell.ts`, now generalized to take this pager's own `panes.length`
 * instead of always assuming the Home shell's 3.
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
  // eslint-disable-next-line react-hooks/refs -- stable Animated.Value identity, read once, never reassigned.
  const panePos = useRef(new Animated.Value(activeIndex)).current;
  // eslint-disable-next-line react-hooks/refs -- same stable-identity idiom as above.
  const paneOpacityPos = useRef(new Animated.Value(activeIndex)).current;
  // Read inside the responder's own callbacks (a ref, not state) so a swipe always resolves against
  // the pane it actually started on, even if activeIndex changes mid-drag some other way (a tab tap).
  const activeIndexRef = useRef(activeIndex);
  // The PanResponder below is built exactly once (useRef), so its callbacks close over whatever
  // `count`/`onActiveIndexChange` were at that first render forever after -- unlike PaneStack.tsx
  // (a constant PANE_COUNT and a stable useState setter, so it never needed this), this pager's
  // `panes.length` can genuinely change (a café's derived tab count) and `onActiveIndexChange` is a
  // fresh closure every render (halls/[slug].tsx's handleActiveIndexChange isn't memoized). Refs,
  // synced the same useLayoutEffect way as activeIndexRef above, so the callbacks always read the
  // current values instead of whatever was true at mount.
  const countRef = useRef(count);
  const onActiveIndexChangeRef = useRef(onActiveIndexChange);
  useLayoutEffect(() => {
    activeIndexRef.current = activeIndex;
    countRef.current = count;
    onActiveIndexChangeRef.current = onActiveIndexChange;
  }, [activeIndex, count, onActiveIndexChange]);
  const dragStartIndex = useRef(activeIndex);
  // Tracks this effect's own "where did the animated position last land" -- separate from
  // activeIndexRef (which the layout effect above already advances to the NEW value before this
  // effect runs, since layout effects fire before passive ones in the same commit). Needed to tell
  // an adjacent commit (swipe, or a single-step tab tap) from a multi-hop one (tapping a
  // non-adjacent tab): a continuous tween only ever passes through index values whose panes are
  // guaranteed mounted when the jump is ±1 (paneDragPosition's own ±1 clamp; windowing mounts
  // activeIndex ± 1). A jump of more than 1 sweeps the SHARED animated position through pane
  // indices outside that window -- panes that are either unmounted (nothing to show, a blank flash)
  // or briefly mounted-then-unmounted at the wrong moment (an unrelated tab's real content flashing
  // fully visible mid-transition, since its own opacity interpolate peaks at 1 exactly where the
  // sweep passes through its index). Real swipes can never trigger this (the shared engine only
  // ever commits ±1), so this only matters for a tab tap more than one tab away -- seed the
  // position directly instead of tweening through panes that were never meant to be seen.
  const committedIndexRef = useRef(activeIndex);

  useEffect(() => {
    const from = committedIndexRef.current;
    if (Math.abs(activeIndex - from) > 1) {
      panePos.setValue(activeIndex);
      paneOpacityPos.setValue(activeIndex);
    } else {
      Animated.timing(panePos, { toValue: activeIndex, duration: 340, easing: PANE_CURVE, useNativeDriver: true }).start();
      Animated.timing(paneOpacityPos, { toValue: activeIndex, duration: 260, easing: Easing.ease, useNativeDriver: true }).start();
    }
    committedIndexRef.current = activeIndex;
    // eslint-disable-next-line react-hooks/refs -- panePos/paneOpacityPos are stable identities (see above).
  }, [activeIndex, panePos, paneOpacityPos]);

  function settlePosition(target: number, from: number = target) {
    Animated.timing(panePos, { toValue: target, duration: settleDuration(from, target, 340), easing: PANE_CURVE, useNativeDriver: true }).start();
    Animated.timing(paneOpacityPos, { toValue: target, duration: settleDuration(from, target, 260), easing: Easing.ease, useNativeDriver: true }).start();
  }

  const panResponder = useRef(
    // eslint-disable-next-line react-hooks/refs -- closes over refs only; same SAME-instance idiom as PaneStack.tsx.
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, gesture) => countRef.current > 1 && isHorizontalSwipe(gesture.dx, gesture.dy),
      onPanResponderGrant: () => {
        dragStartIndex.current = activeIndexRef.current;
        panePos.stopAnimation();
        paneOpacityPos.stopAnimation();
      },
      onPanResponderMove: (_e, gesture) => {
        const dragPos = paneDragPosition(dragStartIndex.current, gesture.dx, countRef.current);
        panePos.setValue(dragPos);
        paneOpacityPos.setValue(dragPos);
      },
      onPanResponderRelease: (_e, gesture) => {
        const next = paneIndexForSwipe(dragStartIndex.current, gesture.dx, gesture.vx, countRef.current);
        settlePosition(next, paneDragPosition(dragStartIndex.current, gesture.dx, countRef.current));
        if (next !== activeIndexRef.current) onActiveIndexChangeRef.current(next);
      },
      onPanResponderTerminate: (_e, gesture) => {
        settlePosition(dragStartIndex.current, paneDragPosition(dragStartIndex.current, gesture.dx, countRef.current));
      },
    }),
  ).current;

  return (
    // eslint-disable-next-line react-hooks/refs -- panResponder is a stable identity, see above.
    <View style={styles.root} {...panResponder.panHandlers}>
      {
        // eslint-disable-next-line react-hooks/refs -- see comment above.
        panes.map((pane, j) => {
          if (Math.abs(j - activeIndex) > 1) return null;
          const active = j === activeIndex;
          const { zIndex, pointerEvents } = paneVisibility(j, activeIndex);
          return (
            <Animated.View
              key={j}
              pointerEvents={pointerEvents}
              accessibilityElementsHidden={!active}
              importantForAccessibility={active ? "auto" : "no-hide-descendants"}
              style={[
                styles.pane,
                {
                  zIndex,
                  transform: [
                    { translateX: panePos.interpolate({ inputRange: [j - 1, j, j + 1], outputRange: paneOffsetRange(PANE_OFFSET), extrapolate: "clamp" }) },
                  ],
                  opacity: paneOpacityPos.interpolate({ inputRange: [j - 1, j, j + 1], outputRange: [0, 1, 0], extrapolate: "clamp" }),
                },
              ]}
            >
              {pane}
            </Animated.View>
          );
        })
      }
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Same background as PaneStack.tsx's own pane style -- without it, the outgoing pane's real
  // background (its own View/SectionList content) shows through the incoming pane's transparent gap
  // during the crossfade instead of a solid backdrop.
  pane: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.cream100 },
});
