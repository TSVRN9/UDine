import { useEffect, useRef, useState, type RefObject } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { segmentHeightFor, segmentTopFor, stationIndexForOffset } from "../lib/hallMenuScrubber";
import type { MenuSection } from "../lib/hallMenuSections";
import { durations } from "../lib/motion";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

const TRACK_WIDTH = 6;
const SEGMENT_GAP = spacing(1);
// Wider than the visible track so a thin line still has a comfortable touch target -- same
// "hitSlop the visual, don't grow it" idea as this screen's other small touch targets
// (FavoriteStar, the info hint circle).
const TOUCH_WIDTH = fs(28);

/** The hall-menu dish list's own scroll-and-jump station index (owner ask, no design-canvas
 * artboard -- see this feature's PR body). One segment per station (`sections`, same array the
 * active SectionList renders); the segment the list is currently scrolled to is highlighted, and
 * pressing/dragging anywhere on the track jumps the list straight to the station under the touch,
 * showing a floating label with that station's name near the touch point while held.
 *
 * Structured like HoldSlideAddButton/HoldSlideOverlay (this screen's own closest precedent for a
 * live-feedback hold-and-drag): gesture-handler drives Reanimated shared values directly from a
 * UI-thread worklet so dragging never re-renders the screen's own SectionLists, and the imperative
 * `scrollToLocation` call (like that overlay's `holdSlideHostRef` calls) crosses back to JS via
 * `runOnJS` only on an actual station-index change, not per touch-move frame. Unlike that button,
 * this gesture doesn't need a LongPress gate or `blocksExternalGesture` -- the track is its own
 * dedicated hit area beside the list, not layered over a scrollable one, so there's no native
 * scroll touch to out-arbitrate; it activates on touch-down (`minDistance(0)`) like a real index
 * jump should, rather than waiting out a hold.
 */
export function StationScrubber({ sections, listRef, activeStationIndex }: { sections: MenuSection[]; listRef: RefObject<any>; activeStationIndex: number }) {
  const count = sections.length;
  const [trackHeight, setTrackHeight] = useState(0);
  const trackHeightShared = useSharedValue(0);
  const [dragLabelIndex, setDragLabelIndex] = useState(activeStationIndex);
  const [labelVisible, setLabelVisible] = useState(false);

  // Animated position (fractional during the highlight's own tween, always an integer target) of
  // the highlighted segment. Driven from two sources that never fight each other: the effect below
  // (normal scroll, via `activeStationIndex`) and the gesture's own worklets (drag) -- `draggingRef`
  // is what keeps the effect from clobbering a drag that's already moved this past the last
  // committed `activeStationIndex` render.
  const highlightIndex = useSharedValue(activeStationIndex);
  const draggingRef = useRef(false);
  const dragging = useSharedValue(false);
  const labelOpacity = useSharedValue(0);
  // Touch's own Y within the track, for the floating label to follow -- deliberately NOT eased
  // (see the label's own style below): it's meant to sit at the finger, not lag behind it.
  const touchY = useSharedValue(0);
  const lastIndex = useSharedValue(activeStationIndex);

  useEffect(() => {
    if (draggingRef.current) return;
    highlightIndex.value = withTiming(activeStationIndex, { duration: durations.stationHighlight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStationIndex]);

  function handleLayout(e: LayoutChangeEvent) {
    const h = e.nativeEvent.layout.height;
    setTrackHeight(h);
    trackHeightShared.value = h;
  }

  // JS-thread commit for a station index the drag has moved onto -- updates the floating label's
  // text and jumps the list. A SectionList can't resolve an exact scroll offset for a station it
  // has never rendered/measured (no getItemLayout here -- row heights vary with name-wrap/expand
  // state), so a jump to a far-off station can under/overshoot on its first attempt; re-issuing
  // the same jump a couple of frames later (once the first attempt's render pass has measured more
  // cells) converges it. `latestRequestedIndexRef` drops a stale retry if the drag has already
  // moved on to a different station by the time it fires, so a fast drag never stutters backward.
  const latestRequestedIndexRef = useRef(0);
  function commitDragIndex(index: number) {
    setDragLabelIndex(index);
    latestRequestedIndexRef.current = index;
    const jump = () => {
      if (latestRequestedIndexRef.current !== index) return;
      listRef.current?.scrollToLocation?.({ sectionIndex: index, itemIndex: 0, animated: false });
    };
    jump();
    requestAnimationFrame(() => requestAnimationFrame(jump));
  }

  function setDragging(value: boolean) {
    draggingRef.current = value;
    setLabelVisible(value);
  }

  // react-hooks/refs and react-hooks/immutability both flag every one of this chain's callbacks
  // below (same false positive MealTabPager.tsx's own `.onEnd` already disables, for the same
  // reason -- see its own comment): the plugin can't see that a Gesture builder's callbacks run
  // later, from the native gesture runtime, never during render, so touching a ref (via
  // runOnJS'd setDragging/commitDragIndex) or re-assigning a Reanimated SharedValue's `.value`
  // (which the plugin's effect-dependency tracking mistakes for a React value) inside them is
  // exactly this pattern's normal, safe use -- not a render-purity violation.
  const pan = Gesture.Pan()
    .enabled(count > 1)
    .minDistance(0)
    // eslint-disable-next-line react-hooks/refs
    .onBegin((e) => {
      dragging.value = true;
      runOnJS(setDragging)(true);
      const idx = stationIndexForOffset(e.y, trackHeightShared.value, count);
      lastIndex.value = idx;
      touchY.value = Math.min(Math.max(e.y, 0), trackHeightShared.value);
      // eslint-disable-next-line react-hooks/immutability
      highlightIndex.value = withTiming(idx, { duration: durations.stationHighlight });
      labelOpacity.value = withTiming(1, { duration: durations.stationLabel.in });
      runOnJS(commitDragIndex)(idx);
    })
    // eslint-disable-next-line react-hooks/refs
    .onUpdate((e) => {
      const clampedY = Math.min(Math.max(e.y, 0), trackHeightShared.value);
      touchY.value = clampedY;
      const idx = stationIndexForOffset(clampedY, trackHeightShared.value, count);
      if (idx !== lastIndex.value) {
        lastIndex.value = idx;
        // eslint-disable-next-line react-hooks/immutability
        highlightIndex.value = withTiming(idx, { duration: durations.stationHighlight });
        runOnJS(commitDragIndex)(idx);
      }
    })
    // eslint-disable-next-line react-hooks/refs
    .onFinalize(() => {
      dragging.value = false;
      runOnJS(setDragging)(false);
      labelOpacity.value = withTiming(0, { duration: durations.stationLabel.out });
    });

  const highlightStyle = useAnimatedStyle(() => {
    const segH = segmentHeightFor(trackHeightShared.value, count, SEGMENT_GAP);
    return {
      height: segH,
      transform: [{ translateY: segmentTopFor(highlightIndex.value, segH, SEGMENT_GAP) }],
    };
  });

  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
    transform: [{ translateY: touchY.value - 16 }],
  }));

  if (count <= 1) return null;
  const segH = trackHeight > 0 ? segmentHeightFor(trackHeight, count, SEGMENT_GAP) : 0;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <View style={styles.touchArea} onLayout={handleLayout} accessibilityLabel="Stations">
          <View style={styles.track} pointerEvents="none">
            {sections.map((section, i) => (
              <View key={section.title} style={[styles.segment, { height: segH, marginBottom: i < count - 1 ? SEGMENT_GAP : 0 }]} />
            ))}
            <Reanimated.View style={[styles.highlight, { width: TRACK_WIDTH }, highlightStyle]} />
          </View>
        </View>
      </GestureDetector>
      {labelVisible && (
        <Reanimated.View style={[styles.label, labelStyle]} pointerEvents="none">
          <Text style={styles.labelText} numberOfLines={1}>
            {sections[dragLabelIndex]?.title ?? ""}
          </Text>
        </Reanimated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // left:0 (not just `right`) -- with only `right` set, `wrap` has no in-flow child wide enough
  // to size itself from (touchArea is absolute-adjacent but still the only non-absolute child, at
  // TOUCH_WIDTH), so it collapses to that width instead of pagerArea's full width. `label` below,
  // positioned by `right` relative to THIS box, then gets its own fit-content sizing measured
  // against that collapsed width instead of the screen -- RN/Yoga clamps an absolutely-positioned
  // child's content measurement to its nearest sized ancestor, not the box it visually escapes
  // into. Spanning the full width here (alignItems below re-pins touchArea to the right edge)
  // gives `label` a real available width to size against.
  wrap: { position: "absolute", top: spacing(3), bottom: spacing(3), left: 0, right: 0, alignItems: "flex-end" },
  touchArea: { width: TOUCH_WIDTH, height: "100%", alignItems: "center" },
  track: { width: TRACK_WIDTH, height: "100%" },
  segment: { width: TRACK_WIDTH, borderRadius: TRACK_WIDTH / 2, backgroundColor: withOpacity(colors.ink900, 15) },
  highlight: { position: "absolute", top: 0, left: 0, borderRadius: TRACK_WIDTH / 2, backgroundColor: colors.gold500 },
  label: {
    position: "absolute",
    right: TOUCH_WIDTH + spacing(2),
    maxWidth: fs(160),
    backgroundColor: colors.maroon900,
    borderRadius: radii.md,
    paddingVertical: spacing(1.5),
    paddingHorizontal: spacing(3),
    shadowColor: colors.ink900,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  labelText: { fontFamily: fonts.body600, fontSize: fs(12), color: colors.paper50 },
});
