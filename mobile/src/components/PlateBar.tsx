import type { DailyMacroTotals } from "@udine/shared";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, spacing } from "../lib/theme";

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
    <Pressable style={[styles.bar, { paddingBottom: spacing(3) + insets.bottom }]} onPress={onPress} onLayout={onLayout} accessibilityRole="button">
      <View style={styles.summary}>
        <Text style={styles.headline}>
          {itemCount} {itemCount === 1 ? "item" : "items"} · {Math.round(totals.calories)} cal
        </Text>
        <Text style={styles.macros}>
          {totals.proteinG.toFixed(0)}g protein · {totals.totalCarbG.toFixed(0)}g carbs · {totals.totalFatG.toFixed(0)}g fat
        </Text>
      </View>
      <View style={styles.logButton}>
        <Text style={styles.logButtonText}>LOG</Text>
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
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    gap: spacing(3),
  },
  summary: { flex: 1 },
  headline: { fontFamily: fonts.display, fontSize: 16, fontWeight: "700", color: colors.paper50 },
  macros: { fontFamily: fonts.body, fontSize: 12, color: colors.paper50, opacity: 0.8, marginTop: spacing(0.5) },
  logButton: { backgroundColor: colors.gold500, borderRadius: 2, paddingVertical: spacing(2), paddingHorizontal: spacing(4) },
  logButtonText: { fontFamily: fonts.body, fontSize: 13, fontWeight: "700", letterSpacing: 1, color: colors.maroon900 },
});
