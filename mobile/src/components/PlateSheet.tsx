import { searchProducts, type DailyMacroTotals, type OffSearchResult } from "@udine/shared";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { isEstimatedServing, totalItemCount, type PlateEntry } from "../lib/plate";
import { Button } from "./ui";
import { colors, fonts, spacing, withOpacity } from "../lib/theme";

interface Props {
  visible: boolean;
  plate: PlateEntry[];
  totals: DailyMacroTotals;
  onStep: (key: string, delta: number) => void;
  onAddOffResult: (result: OffSearchResult) => void;
  onLog: () => void;
  onClose: () => void;
}

/**
 * Expanded plate sheet (canvas: "Plate expanded") — per-item steppers, a totals grid, LOG N ITEMS,
 * and the "Add something else" OpenFoodFacts search row. A RN Modal, same structural call as
 * NutritionLabel (see halls/[slug].tsx's note): no route, no _layout.tsx change, no MenuItem
 * serialization through router params.
 */
export function PlateSheet({ visible, plate, totals, onStep, onAddOffResult, onLog, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OffSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const itemCount = totalItemCount(plate);

  async function runSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      setResults(await searchProducts(query.trim()));
    } catch (e) {
      setSearchError(String(e));
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  function pickResult(result: OffSearchResult) {
    onAddOffResult(result);
    setQuery("");
    setResults(null);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>Your plate</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {plate.map((entry) => (
            <View key={entry.key} style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemLabel}>{entry.label}</Text>
                <Text style={styles.itemCalories}>
                  {Math.round(entry.nutrition.calories * entry.count)} cal{isEstimatedServing(entry.nutrition) ? " · est. per 100g" : ""}
                </Text>
              </View>
              <View style={styles.stepper}>
                <Pressable style={styles.stepperButton} onPress={() => onStep(entry.key, -1)} accessibilityRole="button" accessibilityLabel={`Remove one ${entry.label}`}>
                  <Text style={styles.stepperButtonText}>−</Text>
                </Pressable>
                <Text style={styles.stepperCount}>{entry.count}</Text>
                <Pressable style={styles.stepperButton} onPress={() => onStep(entry.key, 1)} accessibilityRole="button" accessibilityLabel={`Add one ${entry.label}`}>
                  <Text style={styles.stepperButtonText}>+</Text>
                </Pressable>
              </View>
            </View>
          ))}

          <View style={styles.totalsGrid}>
            <View style={styles.totalCell}>
              <Text style={styles.totalValue}>{Math.round(totals.calories)}</Text>
              <Text style={styles.totalLabel}>Calories</Text>
            </View>
            <View style={styles.totalCell}>
              <Text style={styles.totalValue}>{totals.proteinG.toFixed(0)}g</Text>
              <Text style={styles.totalLabel}>Protein</Text>
            </View>
            <View style={styles.totalCell}>
              <Text style={styles.totalValue}>{totals.totalCarbG.toFixed(0)}g</Text>
              <Text style={styles.totalLabel}>Carbs</Text>
            </View>
            <View style={styles.totalCell}>
              <Text style={styles.totalValue}>{totals.totalFatG.toFixed(0)}g</Text>
              <Text style={styles.totalLabel}>Fat</Text>
            </View>
          </View>

          <View style={styles.addSection}>
            <Text style={styles.addHeading}>Add something else</Text>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search packaged foods (OpenFoodFacts)"
                placeholderTextColor={withOpacity(colors.ink900, 45)}
                onSubmitEditing={runSearch}
                returnKeyType="search"
              />
              <Button variant="secondary" size="sm" onPress={runSearch} disabled={searching || !query.trim()}>
                Search
              </Button>
            </View>
            {searching && <ActivityIndicator color={colors.maroon600} style={styles.searchSpinner} />}
            {searchError && <Text style={styles.searchError}>Search failed: {searchError}</Text>}
            {results?.length === 0 && !searching && <Text style={styles.searchHint}>No matches.</Text>}
            {results?.map((r) => (
              <Pressable
                key={r.barcode}
                style={styles.resultRow}
                onPress={() => pickResult(r)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${r.productName} to plate`}
              >
                <Text style={styles.resultLabel}>{r.productName}</Text>
                <Text style={styles.resultCalories}>
                  {Math.round(r.nutrition.calories)} cal{isEstimatedServing(r.nutrition) ? " · est. per 100g" : ""}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button variant="primary" onPress={onLog} disabled={plate.length === 0}>
            {`LOG ${itemCount} ${itemCount === 1 ? "ITEM" : "ITEMS"}`}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream100 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing(4), backgroundColor: colors.maroon900 },
  title: { fontFamily: fonts.display, fontSize: 18, fontWeight: "700", textTransform: "uppercase", color: colors.paper50 },
  close: { fontFamily: fonts.body, fontSize: 14, fontWeight: "600", color: colors.paper50 },
  body: { padding: spacing(4) },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing(2.5),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: withOpacity(colors.ink900, 15),
  },
  itemInfo: { flex: 1 },
  itemLabel: { fontFamily: fonts.body, fontSize: 15, color: colors.ink900 },
  itemCalories: { fontFamily: fonts.mono, fontSize: 12, color: withOpacity(colors.ink900, 60), marginTop: spacing(0.5) },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  stepperButton: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.maroon600, alignItems: "center", justifyContent: "center" },
  stepperButtonText: { fontSize: 16, fontWeight: "700", color: colors.maroon600 },
  stepperCount: { fontFamily: fonts.mono, fontSize: 15, minWidth: 20, textAlign: "center", color: colors.ink900 },
  totalsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing(3), marginTop: spacing(4) },
  totalCell: { minWidth: "40%", flexGrow: 1, backgroundColor: colors.paper50, borderRadius: 6, padding: spacing(3), alignItems: "center" },
  totalValue: { fontFamily: fonts.mono, fontSize: 20, fontWeight: "700", color: colors.maroon900 },
  totalLabel: { fontFamily: fonts.body, fontSize: 12, color: withOpacity(colors.ink900, 60), marginTop: spacing(0.5) },
  addSection: { marginTop: spacing(6) },
  addHeading: { fontFamily: fonts.display, fontSize: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, color: colors.maroon900, marginBottom: spacing(2) },
  searchRow: { flexDirection: "row", gap: spacing(2), alignItems: "center" },
  searchInput: { flex: 1, borderWidth: 1, borderColor: withOpacity(colors.ink900, 25), borderRadius: 4, paddingHorizontal: spacing(3), paddingVertical: spacing(2), fontFamily: fonts.body, color: colors.ink900 },
  searchSpinner: { marginTop: spacing(2) },
  searchError: { fontFamily: fonts.body, fontSize: 13, color: "#b00020", marginTop: spacing(2) },
  searchHint: { fontFamily: fonts.body, fontSize: 13, color: withOpacity(colors.ink900, 55), marginTop: spacing(2) },
  resultRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing(2), borderBottomWidth: StyleSheet.hairlineWidth, borderColor: withOpacity(colors.ink900, 15) },
  resultLabel: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.ink900 },
  resultCalories: { fontFamily: fonts.mono, fontSize: 13, color: withOpacity(colors.ink900, 60) },
  footer: { padding: spacing(4), borderTopWidth: 1, borderColor: withOpacity(colors.ink900, 15), backgroundColor: colors.paper50 },
});
