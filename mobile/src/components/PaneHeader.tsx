import { useEffect } from "react";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import Reanimated, { Easing, Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { Press } from "./Press";
import { PANE_COUNT, YOU_PANE_INDEX, paneMorph, paneOffsetRange } from "../lib/paneShell";
import { durations, reanimatedPaneCurve } from "../lib/motion";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

// Same router.push mechanism YouPane's goToAllLogs uses for /logs. Lives here, not in YouPane's
// scroll content, because "near the pane-position dots" means the fixed header bar.
function goToExport() {
  router.push("/export");
}

/** Pane order: Events, Home, You (matches PaneStack's pane array). MVP cut: was Social/Ping-a-Friend. */
const TITLES = ["EVENTS", "UDINE", "YOU"] as const;

// Hoisted to a module-scope constant rather than called inline inside PaneTitle's
// useAnimatedStyle -- fs() carries no "worklet" directive, so calling it from inside a worklet
// crashes at runtime. Jest's mocked useAnimatedStyle runs worklet bodies as plain JS, so this bug
// class is invisible to the test suite and only surfaces on a real device.
const TITLE_OFFSET = fs(28);

// Preserves the old 6dp-inactive / 8dp-active dot sizing ratio, expressed as a scale factor off a
// fixed-size box instead of an interpolated width/height.
const DOT_MIN_SCALE = fs(6) / fs(8);

// Vertical hitSlop is asymmetric (20 top / 8 bottom, same 28 total) so the dot's hit region
// doesn't reach past the header's opaque bottom edge into pane content scrolled underneath (the
// header is pointerEvents="box-none", so anything past a dot's hit region falls through to
// whatever's beneath it). Left/right capped at 2 to keep adjacent dots' expanded regions from
// overlapping. Both asymmetries are pinned as invariants in PaneHeader.test.tsx, not today's
// specific numbers, so a future resize can't silently reintroduce either bug.
export const DOT_HIT_SLOP = { top: 20, bottom: 8, left: 2, right: 2 };

/** One crossfading title -- its own component (not an inline `.map()` callback) so
 * `useAnimatedStyle` follows the rules of hooks the same way PaneStack.tsx's `StackedPane` /
 * MealTabPager.tsx's `MealTabPane` do. */
function PaneTitle({ title, index, titlePos, titleOpacityPos }: { title: string; index: number; titlePos: SharedValue<number>; titleOpacityPos: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(titlePos.value, [index - 1, index, index + 1], paneOffsetRange(TITLE_OFFSET), Extrapolation.CLAMP) }],
    opacity: interpolate(titleOpacityPos.value, [index - 1, index, index + 1], [0, 1, 0], Extrapolation.CLAMP),
  }));
  return (
    <Reanimated.Text style={[styles.title, style]}>{title}</Reanimated.Text>
  );
}

/** One pane-position dot: a fixed-size box (never itself animated -- Yoga/layout must not re-run
 * per frame) scaled via `transform` when inactive, with two absolutely-positioned fill layers that
 * cross-fade opacity. Driven by `morph`, the same shared value driving the title crossfade. Uses
 * `paneMorph` (paneShell.ts), not `interpolate()`, for the peak/falloff shape. */
function PaneDot({ index, morph }: { index: number; morph: SharedValue<number> }) {
  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: paneMorph(morph.value, index, DOT_MIN_SCALE) }],
  }));
  const activeStyle = useAnimatedStyle(() => ({
    opacity: paneMorph(morph.value, index),
  }));
  const inactiveStyle = useAnimatedStyle(() => ({
    opacity: 1 - paneMorph(morph.value, index),
  }));
  return (
    <Reanimated.View style={[styles.dotBox, boxStyle]}>
      <Reanimated.View style={[styles.dotFill, { backgroundColor: withOpacity(colors.ink900, 25) }, inactiveStyle]} />
      <Reanimated.View style={[styles.dotFill, { backgroundColor: colors.maroon600 }, activeStyle]} />
    </Reanimated.View>
  );
}

/**
 * Fixed header pinned above the 3-pane strip: pane-position dots top-right, the active screen's
 * title crossfading through one top-left slot. Mounted once by PaneStack, outside the per-pane
 * loop -- a remount would restart these shared values and desync the crossfade from the pane
 * transition it tracks. `topInset` is the safe-area top inset; the artboard's 18px assumes no
 * status bar.
 *
 * `titlePos`/`titleOpacityPos` are optional so PaneStack can hand down its own gesture-driven
 * shared values, so the title tracks the drag continuously instead of only crossfading on commit.
 * Omitted, PaneHeader drives its own commit-only values off `activeIndex`. PaneDot shares
 * `titleOpacityPos` since its peak/falloff shape already matches what the dot needs.
 */
export function PaneHeader({
  activeIndex,
  onSelectPane,
  topInset,
  titlePos: sharedTitlePos,
  titleOpacityPos: sharedTitleOpacityPos,
}: {
  activeIndex: number;
  onSelectPane: (index: number) => void;
  topInset: number;
  titlePos?: SharedValue<number>;
  titleOpacityPos?: SharedValue<number>;
}) {
  // Initialized to activeIndex (not 0) so mount never animates from a wrong starting pane.
  const ownTitlePos = useSharedValue(activeIndex);
  const ownTitleOpacityPos = useSharedValue(activeIndex);
  const titlePos = sharedTitlePos ?? ownTitlePos;
  const titleOpacityPos = sharedTitleOpacityPos ?? ownTitleOpacityPos;

  useEffect(() => {
    // When PaneStack shares its own values, it already drives them (continuously, from the drag) --
    // driving ownTitlePos/ownTitleOpacityPos here too would just animate values nothing reads.
    if (!sharedTitlePos) ownTitlePos.value = withTiming(activeIndex, { duration: durations.paneTitle, easing: reanimatedPaneCurve });
    if (!sharedTitleOpacityPos) ownTitleOpacityPos.value = withTiming(activeIndex, { duration: durations.paneTitleFade, easing: Easing.ease });
  }, [activeIndex, ownTitlePos, ownTitleOpacityPos, sharedTitlePos, sharedTitleOpacityPos]);

  return (
    <View style={[styles.container, { paddingTop: topInset + spacing(4.5) }]} pointerEvents="box-none">
      <View style={styles.titleSlot}>
        {TITLES.map((title, j) => (
          <PaneTitle key={title} title={title} index={j} titlePos={titlePos} titleOpacityPos={titleOpacityPos} />
        ))}
      </View>
      <View style={styles.dotsRow}>
        {Array.from({ length: PANE_COUNT }, (_, i) => (
          <Press
            key={i}
            onPress={() => onSelectPane(i)}
            hitSlop={DOT_HIT_SLOP}
            style={styles.dotTapTarget}
            accessibilityRole="button"
            accessibilityLabel={`Go to ${TITLES[i]}`}
          >
            <PaneDot index={i} morph={titleOpacityPos} />
          </Press>
        ))}
      </View>
      {/* You pane's only settings-style action: a single icon, not a new screen. Reuses
          DOT_HIT_SLOP rather than a fresh symmetric one -- its bottom side is capped for the same
          reason (must not reach past this header's opaque box into content scrolled underneath). */}
      {activeIndex === YOU_PANE_INDEX && (
        <Press onPress={goToExport} hitSlop={DOT_HIT_SLOP} style={styles.exportButton} accessibilityRole="button" accessibilityLabel="Export data">
          {/* Bordered-circle + gear glyph, per YouPaneGrouped.dc.html:24-27. */}
          <Svg width={15} height={15} viewBox="0 0 16 16" fill="none">
            <Circle cx={8} cy={8} r={2.1} stroke={colors.maroon900} strokeWidth={1.4} />
            <Path
              d="M8 1.6v1.6M8 12.8v1.6M14.4 8h-1.6M3.2 8H1.6M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7L3.6 3.6"
              stroke={colors.maroon900}
              strokeWidth={1.4}
              strokeLinecap="round"
            />
          </Svg>
        </Press>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    // Opaque, matching the artboard, so content scrolling underneath is hidden, not visible through it.
    backgroundColor: colors.cream100,
    paddingHorizontal: spacing(5),
    // Breathing room against the pane content scrolling in underneath -- without it, content
    // butts straight up against the header's bottom edge once scrolled past the first screenful.
    paddingBottom: spacing(2.5),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  titleSlot: { position: "relative", height: fs(28), flexGrow: 1 },
  title: {
    position: "absolute",
    fontFamily: fonts.display700,
    fontSize: fs(20),
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  dotsRow: { flexDirection: "row", gap: spacing(1.5), alignItems: "center" },
  // marginLeft, not `gap` on a shared wrapper -- a test reads the first numeric `gap` style in DFS
  // order to pin the dots' own hit-region invariant; a wrapper `gap` here would shadow that value.
  // 30x30 bordered circle, per YouPaneGrouped.dc.html:26.
  exportButton: {
    marginLeft: spacing(2),
    width: fs(30),
    height: fs(30),
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 20),
    alignItems: "center",
    justifyContent: "center",
  },
  // Touch-target box, not type -- spacing() (not fs(), fonts/lineHeights only per its own doc
  // comment) is the width-proportional helper for this, same as the container's padding/gap above.
  dotTapTarget: { width: spacing(4), height: spacing(4), alignItems: "center", justifyContent: "center" },
  // Fixed box, never itself animated (see PaneDot) -- fs(8) is the old "active" size, since scaling
  // down from a max size (rather than growing from a min one) is what transform: scale wants.
  dotBox: { width: fs(8), height: fs(8) },
  dotFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: radii.pill },
});
