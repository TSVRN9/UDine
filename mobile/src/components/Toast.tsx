import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Reanimated, { withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { durations, reanimatedEaseCurve, reanimatedPaneCurve, toastRise } from "../lib/motion";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

// `.toastbox` (Prototype.dc.html): opacity on `ease`, transform on the pane bezier, both 260ms, and
// the same in both directions. Reanimated's preset animations take one easing for every property,
// so these are custom layout animations with a curve per property.
const toastEntering = () => {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ translateY: toastRise }] },
    animations: {
      opacity: withTiming(1, { duration: durations.toast, easing: reanimatedEaseCurve }),
      transform: [{ translateY: withTiming(0, { duration: durations.toast, easing: reanimatedPaneCurve }) }],
    },
  };
};
const toastExiting = () => {
  "worklet";
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: {
      opacity: withTiming(0, { duration: durations.toast, easing: reanimatedEaseCurve }),
      transform: [{ translateY: withTiming(toastRise, { duration: durations.toast, easing: reanimatedPaneCurve }) }],
    },
  };
};

export type ToastKind = "success" | "failure";

interface Props {
  kind: ToastKind;
  message: string;
  subline?: string;
  /** Right-side text button (ToastLogged.dc.html "Rate them"); tapping it does not dismiss -- the caller decides. */
  action?: { label: string; onPress: () => void };
  /** Distance from the container's bottom edge -- the caller clears whatever sits there (the plate bar). */
  bottom: number;
  onDismiss: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}

/**
 * Shared toast (ToastLogged.dc.html / ToastLogFailed.dc.html). Absolutely positioned; render it
 * conditionally so the exit animation plays. Tapping anywhere on it dismisses.
 */
export function Toast({ kind, message, subline, action, bottom, onDismiss, onLayout }: Props) {
  const failure = kind === "failure";
  return (
    <Reanimated.View
      entering={toastEntering}
      exiting={toastExiting}
      style={{ position: "absolute", left: spacing(4), right: spacing(4), bottom, zIndex: 40 }}
      onLayout={onLayout}
    >
      <Pressable style={[styles.card, failure ? styles.cardFailure : styles.cardSuccess]} onPress={onDismiss} accessibilityRole="alert">
        <View style={[styles.badge, failure ? styles.badgeFailure : styles.badgeSuccess]}>
          {failure ? (
            <Text style={styles.bang}>!</Text>
          ) : (
            <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
              <Path d="M2.5 6.2l2.4 2.4L9.5 3.8" stroke={colors.maroon900} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          )}
        </View>
        <View style={styles.body}>
          <Text style={[styles.message, failure && styles.messageFailure]}>{message}</Text>
          {subline ? <Text style={styles.subline}>{subline}</Text> : null}
        </View>
        {action ? (
          <Pressable style={styles.action} onPress={action.onPress} accessibilityRole="button">
            <Text style={styles.actionText}>{action.label}</Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    minHeight: 60,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingTop: spacing(2),
    paddingBottom: spacing(2),
    paddingRight: spacing(2),
    paddingLeft: spacing(3.5),
    // box-shadow: 0 8px 24px rgba(36,26,20,0.25)
    shadowColor: colors.ink900,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  cardSuccess: { backgroundColor: colors.paper50, borderColor: colors.gold500 },
  cardFailure: { backgroundColor: colors.maroon600, borderColor: colors.maroon600 },
  badge: { width: 22, height: 22, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  badgeSuccess: { backgroundColor: colors.gold500 },
  badgeFailure: { backgroundColor: colors.paper50 },
  bang: { fontFamily: fonts.body600, fontSize: fs(13), color: colors.maroon600 },
  body: { flex: 1, gap: 1 },
  message: { fontFamily: fonts.body600, fontSize: fs(14), color: colors.ink900 },
  messageFailure: { color: colors.paper50 },
  // The artboard's action div: height 44, padding 0 6px, 12/600 uppercase, letter-spacing 1, maroon600.
  action: { height: 44, paddingHorizontal: 6, justifyContent: "center" },
  actionText: { fontFamily: fonts.body600, fontSize: fs(12), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon600 },
  subline: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.ink900, 60) },
});
