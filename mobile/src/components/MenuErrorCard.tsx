import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

interface Props {
  /** Formatted "H:MM AM/PM"-style time of the cached copy, or null when no cache exists -- the
   * secondary link only renders with a real time. */
  savedCopyTime: string | null;
  onRetry: () => void;
  onShowSavedCopy: () => void;
}

/**
 * Hall menu's "MENU DIDN'T LOAD" retry card -- the one loud state in this screen; everything else
 * (skeleton, offline) is deliberately quiet. No react-native-svg in this codebase -- the
 * warning-triangle/refresh/chevron glyphs are text stand-ins.
 */
export function MenuErrorCard({ savedCopyTime, onRetry, onShowSavedCopy }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        <Text style={styles.iconGlyph}>&#9888;</Text>
      </View>
      <Text style={styles.title}>Menu didn&apos;t load</Text>
      <Text style={styles.copy}>UMass Dining didn&apos;t answer. Check your connection, or the menu for this date may not be posted yet.</Text>
      <Pressable style={styles.tryAgain} onPress={onRetry} accessibilityRole="button" accessibilityLabel="Try again">
        <Text style={styles.tryAgainGlyph}>&#8635;</Text>
        <Text style={styles.tryAgainText}>Try Again</Text>
      </Pressable>
      {savedCopyTime ? (
        <Pressable style={styles.savedCopyLink} onPress={onShowSavedCopy} accessibilityRole="button" accessibilityLabel={`Show saved copy from ${savedCopyTime}`}>
          <Text style={styles.savedCopyText}>SHOW SAVED COPY FROM {savedCopyTime}</Text>
          <Text style={styles.savedCopyChevron}>›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingHorizontal: spacing(9), paddingTop: spacing(10) },
  iconCircle: {
    width: fs(64),
    height: fs(64),
    borderRadius: fs(32),
    backgroundColor: "rgba(124,36,48,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing(4.5),
  },
  iconGlyph: { fontSize: fs(26), color: colors.maroon600 },
  title: {
    fontFamily: fonts.display600,
    fontSize: fs(20),
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.maroon900,
    marginBottom: spacing(1.5),
  },
  copy: {
    fontFamily: fonts.body400,
    fontSize: fs(13),
    lineHeight: fs(19.5),
    textAlign: "center",
    color: withOpacity(colors.ink900, 65),
    marginBottom: spacing(5),
  },
  tryAgain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.gold500,
    borderRadius: radii.md,
    // Unscaled 48, not fs(48) -- touch targets don't scale down on narrow screens; fs(48) would
    // shrink under 44dp on a 320dp device.
    height: 48,
    paddingHorizontal: spacing(8),
    marginBottom: spacing(3.5),
  },
  tryAgainGlyph: { fontSize: fs(15), color: colors.maroon900 },
  tryAgainText: { fontFamily: fonts.display600, fontSize: fs(15), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },
  savedCopyLink: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 44 },
  savedCopyText: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, color: colors.maroon600 },
  savedCopyChevron: { fontSize: fs(12), color: colors.maroon600 },
});
