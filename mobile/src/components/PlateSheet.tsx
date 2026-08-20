import { searchProducts, type DailyMacroTotals, type OffSearchResult } from "@udine/shared";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isEstimatedServing, totalItemCount, type PlateEntry } from "../lib/plate";
import { Button, Stat } from "./ui";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

interface Props {
  visible: boolean;
  plate: PlateEntry[];
  totals: DailyMacroTotals;
  /** Right-of-title context per the canvas ("Hampshire · Lunch") — the caller's hall name. */
  contextLabel?: string;
  onStep: (key: string, delta: number) => void;
  onAddOffResult: (result: OffSearchResult) => void;
  onLog: () => void;
  onClose: () => void;
}

/**
 * Expanded plate sheet (canvas: "Plate expanded") — a bottom sheet over a dimmed scrim: drag
 * handle, per-item steppers, totals grid, LOG N ITEMS, and the dashed "Add something else"
 * OpenFoodFacts search. A transparent RN Modal, same structural call as NutritionLabel (see
 * halls/[slug].tsx's note): no route, no _layout.tsx change, no MenuItem serialization through
 * router params.
 */
export function PlateSheet({ visible, plate, totals, contextLabel, onStep, onAddOffResult, onLog, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OffSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { paddingBottom: spacing(6) + insets.bottom }]}>
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>
            <View style={styles.header}>
              <Text style={styles.title}>Your Plate</Text>
              {contextLabel ? <Text style={styles.context}>{contextLabel}</Text> : null}
            </View>

            <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
              <View style={styles.itemList}>
                {plate.map((entry) => (
                  <View key={entry.key} style={styles.itemRow}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemLabel}>{entry.label}</Text>
                      <Text style={styles.itemCalories}>
                        {Math.round(entry.nutrition.calories)} cal each{isEstimatedServing(entry.nutrition) ? " · est. per 100g" : ""}
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
              </View>

              <View style={styles.divider} />

              <View style={styles.totalsRow}>
                <View style={styles.totalCell}>
                  <Stat label="Calories" value={String(Math.round(totals.calories))} />
                </View>
                <View style={styles.totalCell}>
                  <Stat label="Protein" value={`${totals.proteinG.toFixed(0)}g`} />
                </View>
                <View style={styles.totalCell}>
                  <Stat label="Carbs" value={`${totals.totalCarbG.toFixed(0)}g`} />
                </View>
                <View style={styles.totalCell}>
                  <Stat label="Fat" value={`${totals.totalFatG.toFixed(0)}g`} />
                </View>
              </View>

              <Button variant="primary" style={styles.logButton} textStyle={styles.logButtonText} onPress={onLog} disabled={plate.length === 0}>
                {`LOG ${itemCount} ${itemCount === 1 ? "ITEM" : "ITEMS"}`}
              </Button>

              <View style={styles.addSection}>
                <Text style={styles.addHeading}>Add something else</Text>
                <Text style={styles.addSub}>Search packaged foods (OpenFoodFacts) — for foods not on the menu</Text>
                <View style={styles.searchRow}>
                  <TextInput
                    style={styles.searchInput}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search packaged foods"
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
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: withOpacity(colors.ink900, 50) },
  sheet: {
    backgroundColor: colors.paper50,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingTop: spacing(2.5),
    paddingHorizontal: spacing(5),
    maxHeight: fs(640),
  },
  handleRow: { alignItems: "center", marginBottom: spacing(2.5) },
  handle: { width: fs(40), height: 4, borderRadius: radii.pill, backgroundColor: withOpacity(colors.ink900, 20) },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: spacing(3) },
  title: { fontFamily: fonts.display700, fontSize: fs(20), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },
  context: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.ink900, 55) },
  scroll: { flexGrow: 0 },

  itemList: { gap: spacing(2.5) },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing(2.5) },
  itemInfo: { flex: 1, gap: 1 },
  itemLabel: { fontFamily: fonts.body600, fontSize: fs(14), color: colors.ink900 },
  itemCalories: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.ink900, 60) },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: withOpacity(colors.maroon600, 45),
    borderRadius: radii.pill,
  },
  stepperButton: { width: fs(42), height: fs(44), alignItems: "center", justifyContent: "center" },
  stepperButtonText: { fontSize: fs(18), color: colors.maroon600 },
  stepperCount: { fontFamily: fonts.mono, fontSize: fs(14), fontWeight: "600", minWidth: 24, textAlign: "center", color: colors.ink900 },

  divider: { height: 1, backgroundColor: withOpacity(colors.ink900, 12), marginVertical: spacing(3.5) },

  totalsRow: { flexDirection: "row", gap: spacing(2.5), marginBottom: spacing(3.5) },
  totalCell: { flex: 1 },

  logButton: { height: fs(52), borderRadius: radii.md },
  logButtonText: { fontFamily: fonts.display600, fontSize: fs(16), letterSpacing: 1, textTransform: "uppercase" },

  addSection: {
    marginTop: spacing(3.5),
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: withOpacity(colors.maroon600, 45),
    borderRadius: radii.md,
    padding: spacing(3.5),
    gap: spacing(1),
  },
  addHeading: { fontFamily: fonts.body600, fontSize: fs(13), color: colors.maroon600 },
  addSub: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.ink900, 55) },
  searchRow: { flexDirection: "row", gap: spacing(2), alignItems: "center", marginTop: spacing(1.5) },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 25),
    borderRadius: radii.md,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    fontFamily: fonts.body400,
    color: colors.ink900,
  },
  searchSpinner: { marginTop: spacing(2) },
  searchError: { fontFamily: fonts.body400, fontSize: fs(13), color: "#b00020", marginTop: spacing(2) },
  searchHint: { fontFamily: fonts.body400, fontSize: fs(13), color: withOpacity(colors.ink900, 55), marginTop: spacing(2) },
  resultRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing(2), borderBottomWidth: StyleSheet.hairlineWidth, borderColor: withOpacity(colors.ink900, 15) },
  resultLabel: { flex: 1, fontFamily: fonts.body400, fontSize: fs(14), color: colors.ink900 },
  resultCalories: { fontFamily: fonts.mono, fontSize: fs(13), color: withOpacity(colors.ink900, 60) },
});
