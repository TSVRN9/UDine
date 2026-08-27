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
// narrower screens (13dp at the 320dp breakpoint). #230 moved the vertical hitSlop from symmetric
// (14 top, 14 bottom) to asymmetric (20 top, 8 bottom) -- top+bottom still sums to 28 either way,
// so the *total* effective hit height is deliberately unchanged by that move: 44dp at the artboard
// width / 41dp at 320dp (13 + 20 + 8, same 13 + 14 + 14 as before) -- this 41dp-vs-the-44dp-
// guideline note itself predates #230 and corrects a still-earlier version of this comment that
// overstated it, not anything #230 touched. Horizontally, the spec's own ≥16px tap-target target
// is met only via hitSlop at the 320dp breakpoint (13 visible + 2 + 2 = 17dp effective), not by
// the visible box alone.
//
// Vertical hitSlop is capped on the bottom side to keep the dot's touch-response area from
// reaching past the header's own visible/opaque box (`styles.container`'s backdrop, #245 item 3)
// into pane content scrolled underneath -- the header is pointerEvents="box-none", so anything
// past a dot's own hit region falls through to whatever's beneath it, and a symmetric top+bottom
// 14 pokes ~2-4dp past that box depending on breakpoint. Found on-device: at rest, the You pane's
// "ALL LOGS" link sits nowhere near the header, but once scrolled far enough for it to land in
// that few-dp band directly under the header's bottom edge, a tap there hit the dot instead (#230)
// -- nothing above the dots is tappable (that space is the header's own paddingTop), so the slack
// moved there instead of shrinking the total. Left/right capped at 2, comfortably under half of
// the row's smallest on-device gap (`gap: spacing(1.5)` bottoms out at 5dp at the narrowest
// supported breakpoint, scale ~0.82 -- see docs/agents/emulator-pool.md; reasoned from that
// minimum, confirmed arithmetically -- DOT_HIT_SLOP.left*2 (4) < gap (5), 1dp of clearance -- not
// itself observed on a real 320dp device), keeps adjacent dots' expanded regions from overlapping
// at all. #179 fixed the horizontal case, #230 fixed the vertical one -- both pinned as invariants
// in PaneHeader.test.tsx rather than today's specific numbers, so neither can silently reoccur.
//
// Exported so both invariants are checkable from outside this file, per #134 (test the logic, not
// just the pixels it happens to produce today).
export const DOT_HIT_SLOP = { top: 20, bottom: 8, left: 2, right: 2 };

/**
 * Fixed header pinned above the 3-pane strip (#179): pane-position dots top-right, the active
 * screen's title crossfading through one top-left slot. Mounted once by PaneStack, outside the
 * per-pane loop -- it must never remount across pane switches (a remount would restart these
 * Animated.Values and desync the in-flight crossfade from the pane transition it's meant to
 * track). `topInset` is the safe-area top inset; the artboard's 18px assumes no status bar.
 *
 * #245 item 2: `titlePos`/`titleOpacityPos` are optional so PaneStack can hand down its own
 * gesture-driven Animated.Values -- the title then tracks the drag continuously, same as the
 * panes, instead of only crossfading on commit. Omitted (as in this file's own standalone tests),
 * PaneHeader falls back to driving its own commit-only values off `activeIndex`. The dot morph
 * always stays commit-only regardless -- it animates width/height/backgroundColor with
 * useNativeDriver: false, which can't share a value with panePos's useNativeDriver: true.
 *
 * #245 item 3: `styles.container` carries an opaque cream backdrop (matching the artboard, which
 * has no visually distinct header bar -- title/dots just sit on the same page background) so
 * content scrolling underneath it is actually hidden, not visible through a transparent header.
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
  titlePos?: Animated.Value;
  titleOpacityPos?: Animated.Value;
}) {
  // Initialized to activeIndex (not 0) so mount never animates from a wrong starting pane -- see
  // PaneStack's own comment on the #f5f0d5b landing race this avoids reintroducing by a new cause.
  const ownTitlePos = useRef(new Animated.Value(activeIndex)).current;
  const ownTitleOpacityPos = useRef(new Animated.Value(activeIndex)).current;
  const dotPos = useRef(new Animated.Value(activeIndex)).current;
  const titlePos = sharedTitlePos ?? ownTitlePos;
  const titleOpacityPos = sharedTitleOpacityPos ?? ownTitleOpacityPos;

  useEffect(() => {
    // When PaneStack shares its own values, it already drives them (continuously, from the drag) --
    // driving ownTitlePos/ownTitleOpacityPos here too would just animate values nothing reads.
    if (!sharedTitlePos) Animated.timing(ownTitlePos, { toValue: activeIndex, duration: 340, easing: CURVE, useNativeDriver: true }).start();
    if (!sharedTitleOpacityPos) Animated.timing(ownTitleOpacityPos, { toValue: activeIndex, duration: 260, easing: Easing.ease, useNativeDriver: true }).start();
    // width/height/backgroundColor aren't native-driver properties.
    Animated.timing(dotPos, { toValue: activeIndex, duration: 200, easing: Easing.ease, useNativeDriver: false }).start();
  }, [activeIndex, ownTitlePos, ownTitleOpacityPos, dotPos, sharedTitlePos, sharedTitleOpacityPos]);

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
    // #245 item 3: opaque, matching the artboard (no separate header-bar color -- title/dots sit on
    // the same page background) so content scrolling underneath is hidden, not visible through it.
    backgroundColor: colors.cream100,
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
