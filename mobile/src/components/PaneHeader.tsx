import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Press } from "./Press";
import { PANE_COUNT, paneOffsetRange } from "../lib/paneShell";
import { colors, fonts, fs, radii, withOpacity } from "../lib/theme";

/** Pane order: Social, Home, You (matches PaneStack's pane array). */
const TITLES = ["SOCIAL", "UDINE", "YOU"] as const;

// The artboard's own cubic-bezier -- shared by the pane transition (PaneStack) and this header's
// title crossfade, at their own independently-tuned durations (#179 styling spec).
const CURVE = Easing.bezier(0.22, 0.61, 0.36, 1);

// A dot's own box is fs(16) -- this extends its hit area to clear 44dp without growing the visible
// tap target, same fixed/unscaled convention as index.tsx's GRAB_STRIP_HIT_SLOP.
const DOT_HIT_SLOP = 14;

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
    <View style={[styles.container, { paddingTop: topInset + fs(18) }]} pointerEvents="box-none">
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
    paddingHorizontal: fs(20),
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
  dotsRow: { flexDirection: "row", gap: fs(6), alignItems: "center" },
  dotTapTarget: { width: fs(16), height: fs(16), alignItems: "center", justifyContent: "center" },
});
