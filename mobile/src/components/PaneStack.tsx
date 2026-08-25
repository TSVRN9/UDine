import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, PanResponder, StyleSheet, View } from "react-native";
import { PaneHeader } from "./PaneHeader";
import { isHorizontalSwipe, paneIndexForSwipe, paneOffsetRange, paneVisibility } from "../lib/paneShell";
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
 * Swipe: a discrete commit (±1 pane, clamped), not a drag-proportional position -- the artboard's
 * transition curves are keyed to an integer activePane flip, so a continuous drag→position mapping
 * would abandon those curves mid-gesture. `onMoveShouldSetPanResponder` (not `onStartShouldSet`)
 * with horizontal-dominance gating so each pane's own vertical ScrollView still wins ordinary
 * scrolls -- same PanResponder-only approach SocialPane's ping gesture already uses in this app
 * (no gesture-handler/reanimated dependency).
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
  const panePos = useRef(new Animated.Value(activeIndex)).current;
  const paneOpacityPos = useRef(new Animated.Value(activeIndex)).current;
  // Read inside the responder's own callbacks (refs, not state) so a swipe always resolves against
  // the pane it actually started on, even if activeIndex changes mid-drag some other way.
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const dragStartIndex = useRef(activeIndex);

  useEffect(() => {
    Animated.timing(panePos, { toValue: activeIndex, duration: 340, easing: PANE_CURVE, useNativeDriver: true }).start();
    Animated.timing(paneOpacityPos, { toValue: activeIndex, duration: 260, easing: Easing.ease, useNativeDriver: true }).start();
  }, [activeIndex, panePos, paneOpacityPos]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, gesture) => isHorizontalSwipe(gesture.dx, gesture.dy),
      onPanResponderGrant: () => {
        dragStartIndex.current = activeIndexRef.current;
      },
      onPanResponderRelease: (_e, gesture) => {
        const next = paneIndexForSwipe(dragStartIndex.current, gesture.dx);
        if (next !== activeIndexRef.current) onActiveIndexChange(next);
      },
    }),
  ).current;

  return (
    <View style={styles.root} {...panResponder.panHandlers}>
      {panes.map((pane, j) => {
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
      <PaneHeader activeIndex={activeIndex} onSelectPane={onActiveIndexChange} topInset={topInset} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream100 },
  pane: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.cream100 },
});
