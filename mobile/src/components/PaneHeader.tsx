import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Press } from "./Press";
import { PANE_COUNT, paneOffsetRange } from "../lib/paneShell";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

/** Pane order: Social, Home, You (matches PaneStack's pane array). */
const TITLES = ["SOCIAL", "UDINE", "YOU"] as const;

// The artboard's own cubic-bezier -- shared by the pane transition (PaneStack) and this header's
// title crossfade, at their own independently-tuned durations (#179 styling spec).
const CURVE = Easing.bezier(0.22, 0.61, 0.36, 1);

// A dot's own tap-target box is spacing(4) = 16dp at the artboard width, shrinking with it on
// narrower screens (13dp at the 320dp breakpoint). The fixed (unscaled) vertical hitSlop on top of
// that gets the *vertical* effective hit height to 41dp at 320dp (13 + 14 + 14), not the full 44dp
// guideline -- correcting an earlier version of this comment that overstated it. Horizontally, the
// spec's own ≥16px tap-target target is met only via hitSlop at that breakpoint (13 visible + 2 +
// 2 = 17dp effective), not by the visible box alone.
//
// Horizontal hitSlop is capped well under half the row's `gap` (dotsRow, below): a uniform 14 on
// all sides (dots 16dp wide, only 6dp apart) made the leftmost (SOCIAL) dot completely untappable
// on-device (Agent_Emulator_Wide, #179 review) -- every point in its own real box also fell inside
// the middle (UDINE) dot's expanded region, and UDINE won every one of them. Left/right capped at
// 2, comfortably under half of the row's smallest on-device gap (`gap: spacing(1.5)` bottoms out
// at 5dp at the narrowest supported breakpoint, scale ~0.82 -- see docs/agents/emulator-pool.md;
// reasoned from that minimum, confirmed arithmetically -- DOT_HIT_SLOP.left*2 (4) < gap (5), 1dp
// of clearance -- not itself observed on a real 320dp device), keeps adjacent dots' expanded
// regions from overlapping at all, so this can't reoccur. See PaneHeader.test.tsx for the pinned
// invariant.
//
// Exported so that invariant is checkable from outside this file, per #134 (test the logic, not
// just the pixels it happens to produce today).
export const DOT_HIT_SLOP = { top: 14, bottom: 14, left: 2, right: 2 };

/**
 * Fixed header pinned above the 3-pane strip (#179): pane-position dots top-right, the active
 * screen's title crossfading through one top-left slot. Mounted once by PaneStack, outside the
 * per-pane loop -- it must never remount across pane switches (a remount would restart these
 * Animated.Values and desync the in-flight crossfade from the pane transition it's meant to
 * track). `topInset` is the safe-area top inset; the artboard's 18px assumes no status bar.
 */
export function PaneHeader({ activeIndex, onSelectPane, topInset }: { activeIndex: number; onSelectPane: (index: number) => void; topInset: number }) {
  // Initialized to activeIndex (not 0) so mount never animates from a wrong starting pane -- see
  // PaneStack's own comment on the #f5f0d5b landing race this avoids reintroducing by a new cause.
  const titlePos = useRef(new Animated.Value(activeIndex)).current;
  const titleOpacityPos = useRef(new Animated.Value(activeIndex)).current;
  const dotPos = useRef(new Animated.Value(activeIndex)).current;

  useEffect(() => {
    Animated.timing(titlePos, { toValue: activeIndex, duration: 320, easing: CURVE, useNativeDriver: true }).start();
    Animated.timing(titleOpacityPos, { toValue: activeIndex, duration: 240, easing: Easing.ease, useNativeDriver: true }).start();
    // width/height/backgroundColor aren't native-driver properties.
    Animated.timing(dotPos, { toValue: activeIndex, duration: 200, easing: Easing.ease, useNativeDriver: false }).start();
  }, [activeIndex, titlePos, titleOpacityPos, dotPos]);

  return (
    <View style={[styles.container, { paddingTop: topInset + spacing(4.5) }]} pointerEvents="box-none">
      <View style={styles.titleSlot}>
        {TITLES.map((title, j) => (
          <Animated.Text
            key={title}
            style={[
              styles.title,
              {
                transform: [
                  {
                    translateX: titlePos.interpolate({ inputRange: [j - 1, j, j + 1], outputRange: paneOffsetRange(fs(28)), extrapolate: "clamp" }),
                  },
                ],
                opacity: titleOpacityPos.interpolate({ inputRange: [j - 1, j, j + 1], outputRange: [0, 1, 0], extrapolate: "clamp" }),
              },
            ]}
          >
            {title}
          </Animated.Text>
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
            <Animated.View
              style={{
                width: dotPos.interpolate({ inputRange: [i - 1, i, i + 1], outputRange: [fs(6), fs(8), fs(6)], extrapolate: "clamp" }),
                height: dotPos.interpolate({ inputRange: [i - 1, i, i + 1], outputRange: [fs(6), fs(8), fs(6)], extrapolate: "clamp" }),
                borderRadius: radii.pill,
                backgroundColor: dotPos.interpolate({
                  inputRange: [i - 1, i, i + 1],
                  outputRange: [withOpacity(colors.ink900, 25), colors.maroon600, withOpacity(colors.ink900, 25)],
                }),
              }}
            />
          </Press>
        ))}
      </View>
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
    paddingHorizontal: spacing(5),
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
  // Touch-target box, not type -- spacing() (not fs(), fonts/lineHeights only per its own doc
  // comment) is the width-proportional helper for this, same as the container's padding/gap above.
  dotTapTarget: { width: spacing(4), height: spacing(4), alignItems: "center", justifyContent: "center" },
});
