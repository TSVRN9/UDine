import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View, type ViewStyle } from "react-native";
import { durations } from "../lib/motion";
import { colors, fs, radii, spacing, withOpacity } from "../lib/theme";

/**
 * Skeleton shimmer primitive (#181 canvas: exact CSS is a `background-position` sweep,
 * `rgba(36,26,20,0.09) 25% / 0.045 50% / 0.09 75%`, 1.4s linear infinite). RN has no
 * background-position, so this transcribes the same visual (a soft highlight sweeping left-to-right
 * over a flat base tone) as a `LinearGradient` overlay animated with `translateX` under
 * `useNativeDriver` instead -- same three-stop gradient, same 1.4s linear loop, different animation
 * primitive because that's what the platform has (Animated ships with react-native, no new
 * dependency; expo-linear-gradient is already a dependency, used by index.tsx's hall cards).
 */
function Shimmer({ width }: { width: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: durations.shimmer, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const sweepWidth = width * 2;
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-sweepWidth, width] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { width: sweepWidth, transform: [{ translateX }] }]}>
      <LinearGradient
        colors={[withOpacity(colors.ink900, 9), withOpacity(colors.ink900, 4.5), withOpacity(colors.ink900, 9)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/** One shimmering skeleton bar (a dish-title line, a meta line, a station-header line, ...). Base
 * tone is the gradient's own darkest stop so the bar never looks empty between sweeps. */
export function SkeletonBar({ width, height, style }: { width: number; height: number; style?: ViewStyle }) {
  return (
    <View style={[{ width, height, borderRadius: 4, overflow: "hidden", backgroundColor: withOpacity(colors.ink900, 9) }, style]} testID="skeleton-bar">
      <Shimmer width={width} />
    </View>
  );
}

/** 14×14 spinner (#181 canvas: track circle `rgba(36,26,20,0.25)` stroke 2, arc `#c99a2e`, 1s
 * linear spin). No react-native-svg in this codebase (established convention, see login.tsx) --
 * transcribed as the classic CSS-spinner trick instead: a circular border where one side is the
 * accent color and the rest is the muted track color, rotated. */
export function Spinner({ size = 14 }: { size?: number }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(rotation, { toValue: 1, duration: durations.spin, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [rotation]);

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: withOpacity(colors.ink900, 25),
        borderTopColor: colors.gold500,
        transform: [{ rotate }],
      }}
    />
  );
}

/** Skeleton dish card -- the real card shell (paper50 bg, hairline border, radius 6) around two
 * shimmer bars (title/meta) and an empty 44×44 round stepper outline, per #181's exact spec. */
export function DishCardSkeleton({ titleWidth = fs(140), metaWidth = fs(105) }: { titleWidth?: number; metaWidth?: number }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardText}>
        <SkeletonBar width={titleWidth} height={fs(14)} />
        <SkeletonBar width={metaWidth} height={fs(11)} />
      </View>
      <View style={styles.stepperOutline} />
    </View>
  );
}

/** Station-header skeleton -- a shimmer bar over the real gold rule (unchanged, not skeletonized:
 * the rule itself is decorative chrome, not data). */
export function StationHeaderSkeleton({ width = fs(118) }: { width?: number }) {
  return (
    <View style={styles.stationHeader}>
      <SkeletonBar width={width} height={fs(13)} />
      <View style={styles.goldRule} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing(3),
    backgroundColor: colors.paper50,
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 12),
    borderRadius: radii.md,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3),
  },
  cardText: { gap: spacing(1.5) },
  // 44dp touch-target shape -- deliberately NOT run through fs() (theme.ts: touch targets don't
  // scale down on narrow screens), matching [slug].tsx's real addButton/stepper sizing exactly.
  stepperOutline: { width: 44, height: 44, borderRadius: radii.pill, borderWidth: 1, borderColor: withOpacity(colors.ink900, 12) },
  stationHeader: { gap: spacing(1.5), marginBottom: spacing(1) },
  goldRule: { height: 2, backgroundColor: "rgba(201,154,46,0.5)" },
});
