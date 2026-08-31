import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, PanResponder, StyleSheet, View } from "react-native";
import { PaneHeader } from "./PaneHeader";
import { isHorizontalSwipe, paneDragPosition, paneIndexForSwipe, paneOffsetRange, paneVisibility } from "../lib/paneShell";
import { colors, fs } from "../lib/theme";

// The artboard's own cubic-bezier for the pane transform (#179 styling spec).
const PANE_CURVE = Easing.bezier(0.22, 0.61, 0.36, 1);
const PANE_OFFSET = fs(36);

/**
 * The shared-axis pane shell (#179, replaces the horizontal-ScrollView pager): panes are stacked
 * (position absolute, full screen) instead of a translating strip. `d = j - activePane` drives
 * each pane's translateX/opacity via two Animated.Values (transform and opacity animate on
 * separate curves/durations per the artboard spec, so they're separate values, not one). z-index
 * and pointer-events are read straight off `activeIndex` (paneVisibility, in lib/paneShell.ts) --
 * NOT off the animated position -- so a still-animating-out pane never keeps eating touches meant
 * for the incoming one.
 *
 * PaneHeader is mounted here exactly once, after the panes in JSX but stacked above them via its
 * own z-index -- it must never re-render inside the per-pane loop (see PaneHeader's own doc on why
 * that would desync its Animated.Values).
 *
 * Both Animated.Values start AT activeIndex, not 0: the #f5f0d5b landing race (scrollTo firing
 * before native layout caught up, stranding the shell on Social) doesn't exist in this
 * ScrollView-free architecture, but the same *symptom* -- a first-frame flash of the wrong pane --
 * would reappear from a different cause (an Animated.Value defaulting to 0 = Social) if these
 * weren't seeded correctly.
 *
 * Swipe (#245 item 2): the commit target is still discrete (±1 pane, clamped) -- the artboard's
 * transition curves are keyed to an integer activePane flip -- but the animated position now
 * tracks the drag continuously via `paneDragPosition` (dx / SWIPE_COMMIT_PX from the pane the
 * gesture started on), settling to the committed index with the decided motion (340ms transform /
 * 260ms opacity) on release. `onMoveShouldSetPanResponder` (not `onStartShouldSet`) with
 * horizontal-dominance gating so each pane's own vertical ScrollView still wins ordinary scrolls --
 * same PanResponder-only approach used elsewhere in this app (no gesture-handler/reanimated
 * dependency). `panePos`/`paneOpacityPos` are also handed to PaneHeader
 * so its title crossfade tracks the same drag (the dot morph stays commit-only -- it animates
 * width/height/backgroundColor with useNativeDriver: false, which can't share a native-driven
 * value with the panes' transform/opacity).
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
  // #336: idiomatic RN pattern, reading `.current` once during render for a stable
  // Animated.Value identity; never reassigned.
  // eslint-disable-next-line react-hooks/refs
  const panePos = useRef(new Animated.Value(activeIndex)).current;
  // eslint-disable-next-line react-hooks/refs -- #336: same stable-identity idiom as above.
  const paneOpacityPos = useRef(new Animated.Value(activeIndex)).current;
  // Read inside the responder's own callbacks (refs, not state) so a swipe always resolves against
  // the pane it actually started on, even if activeIndex changes mid-drag some other way.
  const activeIndexRef = useRef(activeIndex);
  // useLayoutEffect (not useEffect / not a write during render, #336): the sync must land during the
  // commit phase, before a gesture responder (onPanResponderGrant/Release) can possibly fire and read
  // a stale value, and it must not run during render itself -- React Compiler may memoize this
  // component and skip re-executing the body on a render it infers as a no-op, which would drop a
  // plain render-time write silently. A passive useEffect is scheduled after paint, leaving a window
  // where a touch could start before the ref is caught up; useLayoutEffect closes that window.
  useLayoutEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);
  const dragStartIndex = useRef(activeIndex);

  useEffect(() => {
    Animated.timing(panePos, { toValue: activeIndex, duration: 340, easing: PANE_CURVE, useNativeDriver: true }).start();
    Animated.timing(paneOpacityPos, { toValue: activeIndex, duration: 260, easing: Easing.ease, useNativeDriver: true }).start();
    // #336: panePos/paneOpacityPos are stable useRef(...).current identities (see above); listed
    // so this effect only re-fires on a real activeIndex commit, per the comment below -- not a
    // reassignment.
    // eslint-disable-next-line react-hooks/refs
  }, [activeIndex, panePos, paneOpacityPos]);

  // Separate from the effect above (not a shared/memoized helper referenced by both): the effect's
  // dependency array must stay exactly [activeIndex, panePos, paneOpacityPos] so it only re-fires on
  // a real commit, not on every render -- an un-memoized closure sitting in that array would restart
  // the animation constantly (Home re-renders often: hours fetch, favorites, focus). This one runs
  // only from the gesture handlers below, imperatively, never from a dependency array.
  function settlePosition(target: number) {
    Animated.timing(panePos, { toValue: target, duration: 340, easing: PANE_CURVE, useNativeDriver: true }).start();
    Animated.timing(paneOpacityPos, { toValue: target, duration: 260, easing: Easing.ease, useNativeDriver: true }).start();
  }

  const panResponder = useRef(
    // #336: closes over panePos/paneOpacityPos/dragStartIndex/activeIndexRef (all refs) so the
    // SAME PanResponder instance persists across renders (see comment above); reads them, never
    // reassigns them here.
    // eslint-disable-next-line react-hooks/refs
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, gesture) => isHorizontalSwipe(gesture.dx, gesture.dy),
      onPanResponderGrant: () => {
        dragStartIndex.current = activeIndexRef.current;
        // A settle from the previous gesture (release/terminate) can still be in flight when a new
        // drag starts -- stop it so onPanResponderMove's setValue below isn't fighting a timing.
        panePos.stopAnimation();
        paneOpacityPos.stopAnimation();
      },
      onPanResponderMove: (_e, gesture) => {
        const dragPos = paneDragPosition(dragStartIndex.current, gesture.dx);
        panePos.setValue(dragPos);
        paneOpacityPos.setValue(dragPos);
      },
      onPanResponderRelease: (_e, gesture) => {
        const next = paneIndexForSwipe(dragStartIndex.current, gesture.dx);
        settlePosition(next);
        if (next !== activeIndexRef.current) onActiveIndexChange(next);
      },
      // A responder can be preempted mid-drag (e.g. a parent gesture/navigation stealing it) --
      // settle back to where the drag started instead of stranding the pane at a fractional offset.
      onPanResponderTerminate: () => {
        settlePosition(dragStartIndex.current);
      },
    }),
  ).current;

  return (
    // #336: panResponder is a stable useRef(...).current identity (see below), read once here for
    // the panHandlers spread; never reassigned.
    // eslint-disable-next-line react-hooks/refs
    <View style={styles.root} {...panResponder.panHandlers}>
      {/* panePos/paneOpacityPos (read here via each pane's interpolate()) are stable
         useRef(...).current identities, see above -- not a reassignment. */}
      {
        // eslint-disable-next-line react-hooks/refs -- #336: see comment above.
        panes.map((pane, j) => {
        const { zIndex, pointerEvents } = paneVisibility(j, activeIndex);
        return (
          <Animated.View
            key={j}
            pointerEvents={pointerEvents}
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
      })}
      <PaneHeader
        activeIndex={activeIndex}
        onSelectPane={onActiveIndexChange}
        topInset={topInset}
        titlePos={panePos}
        titleOpacityPos={paneOpacityPos}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream100 },
  pane: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.cream100 },
});
