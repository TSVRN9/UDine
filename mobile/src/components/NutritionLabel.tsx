import type { NutritionFacts } from "@udine/shared";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildLabelRows } from "../lib/nutritionLabel";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

interface Props {
  visible: boolean;
  dishName: string;
  /** Context line under the dish name (e.g. "Hampshire · Lunch Entrées"), or -- when `badge` is
   * set -- the "via {source}" attribution caption next to the badge pill. */
  subtitle?: string;
  /** Filled source-badge pill label (e.g. "PACKAGED"/"UMASS"/"USDA"/"CUSTOM"), shown only for the
   * PlateSheet search-result confirm step. Omitted → the base on-menu-dish header is used. */
  badge?: string;
  nutrition: NutritionFacts;
  allergens: string[];
  dietTags: string[];
  /** Raw ingredient-statement prose from the feed (data-ingredient-list). Omitted → no section. */
  ingredients?: string;
  /** Canvas bottom bar: quantity stepper + ADD TO PLATE. Omitted → the bar isn't rendered. */
  onAddToPlate?: (count: number) => void;
  onClose: () => void;
}

/**
 * Full-screen FDA-style nutrition label. onRequestClose covers the Android hardware back button;
 * the header back chevron covers everyone else, since a modal with no Stack header otherwise has
 * no way back.
 */
export function NutritionLabel({ visible, dishName, subtitle, badge, nutrition, allergens, dietTags, ingredients, onAddToPlate, onClose }: Props) {
  const rows = buildLabelRows(nutrition);
  const [count, setCount] = useState(1);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + spacing(4.5) }]}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.backChevron}>‹</Text>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.dishName}>{dishName}</Text>
            {badge ? (
              <View style={styles.badgeRow}>
                <View style={styles.badgePill}>
                  <Text style={styles.badgePillText}>{badge}</Text>
                </View>
                {subtitle ? <Text style={styles.badgeCaption}>{subtitle}</Text> : null}
              </View>
            ) : subtitle ? (
              <Text style={styles.headerSubtitle}>{subtitle}</Text>
            ) : null}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.labelCard}>
            <Text style={styles.title}>Nutrition Facts</Text>
            <Text style={styles.servingSize}>
              Serving size <Text style={styles.servingSizeValue}>{nutrition.servingSize || "—"}</Text>
            </Text>
            <View style={styles.thickRule} />

            <View style={styles.caloriesRow}>
              <Text style={styles.caloriesLabel}>Calories</Text>
              <Text style={styles.caloriesValue}>{Math.round(nutrition.calories)}</Text>
            </View>
            <View style={styles.mediumRule} />

            {rows.map((row) => (
              <View key={row.label} style={[styles.row, row.indent && styles.rowIndent]}>
                <Text style={[styles.rowLabel, row.indent && styles.rowLabelIndent]}>
                  {row.label} <Text style={styles.rowAmount}>{row.amount}</Text>
                </Text>
                {row.dv !== null && <Text style={styles.rowDv}>{row.dv}</Text>}
              </View>
            ))}
          </View>

          {allergens.length > 0 && (
            <View style={styles.chipRow}>
              <Text style={styles.chipHeading}>Allergens</Text>
              {allergens.map((a) => (
                <View key={a} style={styles.allergenPill}>
                  <Text style={styles.allergenPillText}>{a}</Text>
                </View>
              ))}
            </View>
          )}

          {dietTags.length > 0 && (
            <View style={styles.chipRow}>
              <Text style={styles.chipHeading}>Diet</Text>
              {dietTags.map((t) => (
                <View key={t} style={styles.dietPill}>
                  <Text style={styles.dietPillText}>{t}</Text>
                </View>
              ))}
            </View>
          )}

          {ingredients && (
            <View style={styles.ingredientsBlock}>
              <Text style={styles.chipHeading}>Ingredients</Text>
              <Text style={styles.ingredientsText}>{ingredients}</Text>
            </View>
          )}
        </ScrollView>

        {onAddToPlate && (
          <View style={[styles.footer, { paddingBottom: spacing(3) + insets.bottom }]}>
            <View style={styles.stepper}>
              <Pressable style={styles.stepperButton} onPress={() => setCount((c) => Math.max(1, c - 1))} accessibilityRole="button" accessibilityLabel="One fewer serving">
                <Text style={styles.stepperButtonText}>−</Text>
              </Pressable>
              <Text style={styles.stepperCount}>{count}</Text>
              <Pressable style={styles.stepperButton} onPress={() => setCount((c) => c + 1)} accessibilityRole="button" accessibilityLabel="One more serving">
                <Text style={styles.stepperButtonText}>+</Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.addButton}
              onPress={() => {
                onAddToPlate(count);
                setCount(1);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Add ${count} ${dishName} to plate`}
            >
              <Text style={styles.addButtonText}>Add to plate</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream100 },
  header: {
    flexDirection: "row",
    // flex-start, not center: a long dishName can wrap to 2+ lines, and centering against that
    // taller block drags the back chevron down instead of keeping it level with line 1.
    alignItems: "flex-start",
    gap: spacing(3),
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(3),
  },
  backChevron: { fontFamily: fonts.body400, fontSize: fs(32), lineHeight: fs(34), color: colors.maroon900, marginTop: -4 },
  headerText: { flex: 1 },
  dishName: { fontFamily: fonts.display700, fontSize: fs(22), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },
  headerSubtitle: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.ink900, 60) },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: spacing(1.5) },
  badgePill: { backgroundColor: withOpacity(colors.ink900, 8), borderRadius: radii.pill, paddingVertical: spacing(0.5), paddingHorizontal: spacing(2) },
  badgePillText: { fontFamily: fonts.body600, fontSize: fs(10), fontWeight: "700", letterSpacing: 0.5, color: withOpacity(colors.ink900, 65) },
  badgeCaption: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.ink900, 50) },

  body: { paddingHorizontal: spacing(5), paddingBottom: spacing(6), gap: spacing(2) },

  labelCard: {
    backgroundColor: colors.paper50,
    borderWidth: 2,
    borderColor: colors.ink900,
    borderRadius: radii.md,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3.5),
    marginBottom: spacing(2),
  },
  title: { fontFamily: fonts.display700, fontSize: fs(26), letterSpacing: 0.5, color: colors.ink900 },
  servingSize: { fontFamily: fonts.body400, fontSize: fs(13), color: colors.ink900, marginTop: 6 },
  servingSizeValue: { fontFamily: fonts.mono, fontWeight: "600" },
  thickRule: { height: 8, backgroundColor: colors.ink900, marginVertical: spacing(1.5) },
  mediumRule: { height: 4, backgroundColor: colors.ink900, marginVertical: spacing(1.5) },
  caloriesRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  caloriesLabel: { fontFamily: fonts.body600, fontSize: fs(14), color: colors.ink900 },
  caloriesValue: { fontFamily: fonts.mono, fontSize: fs(30), fontWeight: "600", lineHeight: fs(30), color: colors.ink900 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderColor: withOpacity(colors.ink900, 25),
  },
  rowIndent: { paddingLeft: spacing(4) },
  rowLabel: { fontFamily: fonts.body600, fontSize: fs(13), color: colors.ink900 },
  rowLabelIndent: { fontFamily: fonts.body400 },
  rowAmount: { fontFamily: fonts.mono, fontWeight: "400" },
  rowDv: { fontFamily: fonts.mono, fontSize: fs(13), fontWeight: "600", color: colors.ink900 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing(1.5), marginTop: spacing(1) },
  chipHeading: {
    fontFamily: fonts.body600,
    fontSize: fs(11),
    letterSpacing: 1,
    textTransform: "uppercase",
    color: withOpacity(colors.ink900, 55),
    marginRight: spacing(0.5),
  },
  allergenPill: {
    backgroundColor: withOpacity(colors.maroon600, 12),
    borderRadius: radii.pill,
    paddingVertical: spacing(1),
    paddingHorizontal: spacing(2.5),
  },
  allergenPillText: { fontFamily: fonts.body600, fontSize: fs(12), color: colors.maroon600 },
  dietPill: {
    borderWidth: 1,
    borderColor: withOpacity(colors.gold500, 70),
    borderRadius: radii.pill,
    paddingVertical: spacing(1),
    paddingHorizontal: spacing(2.5),
  },
  dietPillText: { fontFamily: fonts.body600, fontSize: fs(12), color: colors.ink900 },

  ingredientsBlock: { marginTop: spacing(1) },
  ingredientsText: { fontFamily: fonts.body400, fontSize: fs(12), lineHeight: fs(18), color: withOpacity(colors.ink900, 75), marginTop: spacing(0.5) },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3.5),
    backgroundColor: colors.paper50,
    borderTopWidth: 1,
    borderColor: withOpacity(colors.ink900, 12),
    paddingHorizontal: spacing(5),
    paddingTop: spacing(3),
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: withOpacity(colors.maroon600, 45),
    borderRadius: radii.pill,
  },
  stepperButton: { width: fs(44), height: fs(44), alignItems: "center", justifyContent: "center" },
  stepperButtonText: { fontSize: fs(18), color: colors.maroon600 },
  stepperCount: { fontFamily: fonts.mono, fontSize: fs(14), fontWeight: "600", minWidth: 24, textAlign: "center", color: colors.ink900 },
  addButton: {
    flex: 1,
    height: fs(48),
    borderRadius: radii.md,
    backgroundColor: colors.maroon600,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: {
    fontFamily: fonts.display600,
    fontSize: fs(15),
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.paper50,
  },
});
