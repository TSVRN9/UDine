import type { DailyMacroTotals } from "@udine/shared";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

interface Props {
  itemCount: number;
  totals: DailyMacroTotals;
  onPress: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}

/**
 * Collapsed bottom summary bar (canvas: "Hall menu + plate bar") — tap anywhere to open the
 * expanded sheet. Only rendered by the caller while the plate is non-empty. Absolutely positioned
 * over the dish list, so it pads for the bottom safe-area inset itself (else it reproduces the
 * occlusion-class bug from PR #78/#84 against the system nav bar instead of against list content).
 * expo-router's root already wraps the app in SafeAreaProvider, so useSafeAreaInsets works here
 * without any _layout.tsx change.
 */
export function PlateBar({ itemCount, totals, onPress, onLayout }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable style={[styles.bar, { paddingBottom: spacing(4) + insets.bottom }]} onPress={onPress} onLayout={onLayout} accessibilityRole="button">
      <View style={styles.summary}>
        <View style={styles.headlineRow}>
          <Text style={styles.chevron}>⌃</Text>
          <Text style={styles.headline}>
            {itemCount} {itemCount === 1 ? "item" : "items"} · {Math.round(totals.calories)} cal
          </Text>
        </View>
        <Text style={styles.macros}>
          {totals.proteinG.toFixed(0)}g protein · {totals.totalCarbG.toFixed(0)}g carbs · {totals.totalFatG.toFixed(0)}g fat
        </Text>
      </View>
      <View style={styles.logButton}>
        <Text style={styles.logButtonText}>Log</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.maroon900,
    paddingHorizontal: spacing(5),
    paddingTop: spacing(3),
    gap: spacing(3.5),
  },
  summary: { flex: 1, gap: 2 },
  headlineRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  chevron: { fontFamily: fonts.body600, fontSize: fs(13), lineHeight: fs(16), color: withOpacity(colors.paper50, 60) },
  headline: { fontFamily: fonts.body600, fontSize: fs(15), color: colors.paper50 },
  macros: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.paper50, 65) },
  logButton: {
    backgroundColor: colors.gold500,
    borderRadius: radii.md,
    height: fs(48),
    paddingHorizontal: spacing(6.5),
    alignItems: "center",
    justifyContent: "center",
  },
  logButtonText: {
    fontFamily: fonts.display600,
    fontSize: fs(16),
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.maroon900,
  },
});
