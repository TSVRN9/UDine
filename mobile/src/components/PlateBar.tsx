import type { DailyMacroTotals } from "@udine/shared";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatServings } from "../lib/servingsStepper";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

interface Props {
  itemCount: number;
  totals: DailyMacroTotals;
  // undefined/null -- no priced item on the plate -- renders exactly as today, no third segment.
  priceTotal?: string | null;
  onPress: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
  /** The empty-plate variant, always passed by the caller now that the bar is always mounted. Only
   * meaningful when itemCount is 0 -- a plate that already has real items always shows the normal,
   * functional bar regardless of the menu's own fetch state. */
  emptyState?: { subline: string; disabled?: boolean };
}

/**
 * Collapsed bottom summary bar -- tap anywhere to open the expanded sheet. Always tappable,
 * including the empty-plate variant: opening the sheet is how OFF search gets reached, unrelated
 * to whether anything's staged yet or whether the on-menu list has loaded. Absolutely positioned
 * over the dish list, so it pads for the bottom safe-area inset itself, against the system nav bar
 * rather than against list content.
 */
export function PlateBar({ itemCount, totals, priceTotal, onPress, onLayout, emptyState }: Props) {
  const insets = useSafeAreaInsets();
  const showEmptyState = emptyState && itemCount === 0;
  return (
    <Pressable style={[styles.bar, { paddingBottom: spacing(4) + insets.bottom }]} onPress={onPress} onLayout={onLayout} accessibilityRole="button">
      {showEmptyState ? (
        <>
          <View style={styles.summary}>
            <Text style={styles.emptyHeadline}>Plate is empty</Text>
            <Text style={styles.emptySubline}>{emptyState.subline}</Text>
          </View>
          <View style={[styles.logButton, emptyState.disabled && styles.logButtonDisabled]}>
            <Text style={[styles.logButtonText, emptyState.disabled && styles.logButtonTextDisabled]}>Log</Text>
          </View>
        </>
      ) : (
        <>
          <View style={styles.summary}>
            <View style={styles.headlineRow}>
              <Text style={styles.chevron}>⌃</Text>
              <Text style={styles.headline}>
                {formatServings(itemCount)} {itemCount === 1 ? "item" : "items"} · {Math.round(totals.calories)} cal{priceTotal ? ` · ${priceTotal}` : ""}
              </Text>
            </View>
            <Text style={styles.macros}>
              {totals.proteinG.toFixed(0)}g protein · {totals.totalCarbG.toFixed(0)}g carbs · {totals.totalFatG.toFixed(0)}g fat
            </Text>
          </View>
          <View style={styles.logButton}>
            <Text style={styles.logButtonText}>Log</Text>
          </View>
        </>
      )}
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
  // Dimmer than the normal headline/macros text so it reads as inert rather than a live summary.
  emptyHeadline: { fontFamily: fonts.body600, fontSize: fs(15), color: withOpacity(colors.paper50, 55) },
  emptySubline: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.paper50, 40) },
  logButton: {
    backgroundColor: colors.gold500,
    borderRadius: radii.md,
    height: fs(48),
    paddingHorizontal: spacing(6.5),
    alignItems: "center",
    justifyContent: "center",
  },
  logButtonDisabled: { backgroundColor: "rgba(201,154,46,0.35)" },
  logButtonText: {
    fontFamily: fonts.display600,
    fontSize: fs(16),
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  logButtonTextDisabled: { color: "rgba(59,10,15,0.6)" },
});
