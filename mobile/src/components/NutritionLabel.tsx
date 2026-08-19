import type { NutritionFacts } from "@udine/shared";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { buildLabelRows } from "../lib/nutritionLabel";
import { Badge } from "./ui";
import { colors, fonts, spacing, withOpacity } from "../lib/theme";

interface Props {
  visible: boolean;
  dishName: string;
  nutrition: NutritionFacts;
  allergens: string[];
  dietTags: string[];
  onClose: () => void;
}

/**
 * Full-screen FDA-style nutrition label (canvas: "Nutrition label"). A RN Modal rather than a routed
 * screen — see halls/[slug].tsx's file-level note on that structural call. onRequestClose covers the
 * Android hardware back button; the header Close button covers everyone else, since a modal with no
 * Stack header otherwise has no way back.
 */
export function NutritionLabel({ visible, dishName, nutrition, allergens, dietTags, onClose }: Props) {
  const rows = buildLabelRows(nutrition);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.dishName}>{dishName}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.label}>
          <Text style={styles.title}>Nutrition Facts</Text>
          <Text style={styles.servingSize}>Serving size: {nutrition.servingSize || "—"}</Text>
          <View style={styles.thickRule} />

          <View style={styles.caloriesRow}>
            <Text style={styles.caloriesLabel}>Calories</Text>
            <Text style={styles.caloriesValue}>{Math.round(nutrition.calories)}</Text>
          </View>
          <View style={styles.thickRule} />

          <Text style={styles.dvHeader}>% Daily Value*</Text>

          {rows.map((row) => (
            <View key={row.label} style={[styles.row, row.indent && styles.rowIndent]}>
              <Text style={[styles.rowLabel, row.indent && styles.rowLabelIndent]}>
                {row.label} <Text style={styles.rowAmount}>{row.amount}</Text>
              </Text>
              {row.dv !== null && <Text style={styles.rowDv}>{row.dv}</Text>}
            </View>
          ))}

          <View style={styles.thickRule} />
          <Text style={styles.footnote}>* % Daily Value tells you how much a nutrient in a serving contributes to a daily diet.</Text>

          {allergens.length > 0 && (
            <View style={styles.chipSection}>
              <Text style={styles.chipHeading}>Allergens</Text>
              <View style={styles.chipRow}>
                {allergens.map((a) => (
                  <Badge key={a}>{a}</Badge>
                ))}
              </View>
            </View>
          )}

          {dietTags.length > 0 && (
            <View style={styles.chipSection}>
              <Text style={styles.chipHeading}>Diet</Text>
              <View style={styles.chipRow}>
                {dietTags.map((t) => (
                  <Badge key={t} style={styles.dietChip}>
                    {t}
                  </Badge>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper50 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing(4),
    backgroundColor: colors.maroon900,
  },
  dishName: { flex: 1, fontFamily: fonts.display, fontSize: 18, fontWeight: "700", color: colors.paper50, marginRight: spacing(3) },
  close: { fontFamily: fonts.body, fontSize: 14, fontWeight: "600", color: colors.paper50 },
  label: { padding: spacing(4) },
  title: { fontFamily: fonts.display, fontSize: 28, fontWeight: "700", textTransform: "uppercase", color: colors.ink900 },
  servingSize: { fontFamily: fonts.body, fontSize: 14, color: colors.ink900, marginTop: spacing(1) },
  thickRule: { height: 8, backgroundColor: colors.ink900, marginVertical: spacing(2) },
  caloriesRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  caloriesLabel: { fontFamily: fonts.display, fontSize: 22, fontWeight: "700", color: colors.ink900 },
  caloriesValue: { fontFamily: fonts.mono, fontSize: 32, fontWeight: "700", color: colors.ink900 },
  dvHeader: { textAlign: "right", fontFamily: fonts.body, fontSize: 12, fontWeight: "700", color: colors.ink900, borderBottomWidth: 1, borderColor: colors.ink900, paddingBottom: spacing(1) },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingVertical: spacing(1.5), borderBottomWidth: StyleSheet.hairlineWidth, borderColor: withOpacity(colors.ink900, 30) },
  rowIndent: { paddingLeft: spacing(4) },
  rowLabel: { fontFamily: fonts.body, fontSize: 14, fontWeight: "700", color: colors.ink900 },
  rowLabelIndent: { fontWeight: "500" },
  rowAmount: { fontFamily: fonts.mono, fontWeight: "400" },
  rowDv: { fontFamily: fonts.mono, fontSize: 14, fontWeight: "700", color: colors.ink900 },
  footnote: { fontFamily: fonts.body, fontSize: 11, color: withOpacity(colors.ink900, 65), marginTop: spacing(1) },
  chipSection: { marginTop: spacing(4) },
  chipHeading: { fontFamily: fonts.display, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, color: colors.maroon900, marginBottom: spacing(1.5) },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(1.5) },
  dietChip: { backgroundColor: withOpacity(colors.gold500, 20) },
});
