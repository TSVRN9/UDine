import { searchProducts, type DailyMacroTotals, type OffSearchResult } from "@udine/shared";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { isEstimatedServing, totalItemCount, type PlateEntry } from "../lib/plate";
import { Button, Stat } from "./ui";
import { useSheetAnim } from "../lib/sheetAnimation";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

/** Magnifying-glass icon for the "Add something else" entry (artboard spec) -- a real
 * react-native-svg icon, not a Unicode stand-in (see halls/[slug].tsx's GrabBagIcon, this
 * dependency's other use). */
function SearchIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
      <Circle cx={9} cy={9} r={5.5} stroke={color} strokeWidth={1.6} />
      <Path d="M13.5 13.5L17 17" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

interface Props {
  visible: boolean;
  plate: PlateEntry[];
  totals: DailyMacroTotals;
  /** Right-of-title context per the canvas ("Hampshire · Lunch") — the caller's hall name. */
  contextLabel?: string;
  onStep: (key: string, delta: number) => void;
  onAddOffResult: (result: OffSearchResult) => void;
  /** Logs a single OFF result on its own, independent of whatever's staged on the plate -- the
   * "grabbed a piece of fruit, nothing else to log" case, which the plate/LOG N ITEMS flow alone
   * can't cover (that always logs everything staged, not just the item just searched for).
   * Resolves true on success so this component can show its own inline confirmation without
   * depending on the caller's own (screen-level, hidden behind this Modal) logged-banner. */
  onLogOffResult: (result: OffSearchResult) => Promise<boolean>;
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
export function PlateSheet({ visible, plate, totals, contextLabel, onStep, onAddOffResult, onLogOffResult, onLog, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OffSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Direct-log state for a single search result row -- independent of the plate/LOG N ITEMS flow.
  // `barcode`, not the whole result object, since that's all identity a row needs to match itself.
  const [loggingBarcode, setLoggingBarcode] = useState<string | null>(null);
  const [directLogOutcome, setDirectLogOutcome] = useState<{ barcode: string; ok: boolean } | null>(null);
  const insets = useSafeAreaInsets();
  const { backdropStyle, panelStyle } = useSheetAnim(visible);
  const scrollRef = useRef<ScrollView>(null);
  // KeyboardAvoidingView's automatic height-tracking doesn't reach content mounted inside an
  // Android RN <Modal> -- confirmed on-device: with `behavior="height"` set, the sheet never
  // resized or shifted at all when the keyboard opened, leaving the search input fully hidden
  // behind it. Tracked manually instead, still via RN's own built-in Keyboard API (no new
  // dependency) -- see the sheet's own style below for how this is applied.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  // #198: bumped on every new search and on close -- a resolving searchProducts call only applies
  // its result if this still matches the seq it captured when it started, so a slower/stale
  // response can never overwrite a newer query's results (or repaint a sheet the user closed).
  const searchSeq = useRef(0);

  const itemCount = totalItemCount(plate);

  // Closing invalidates whatever's in flight and resets the search box -- a stale response that
  // resolves after close must not repaint a sheet the user dismissed, and reopening should offer a
  // clean search rather than a "searching..." spinner stuck on a request nothing will ever apply.
  useEffect(() => {
    if (!visible) {
      searchSeq.current++;
      setSearching(false);
      setResults(null);
      setSearchError(null);
      setQuery("");
      setLoggingBarcode(null);
      setDirectLogOutcome(null);
    }
  }, [visible]);

  async function logResultDirectly(result: OffSearchResult) {
    setLoggingBarcode(result.barcode);
    setDirectLogOutcome(null);
    const ok = await onLogOffResult(result);
    setLoggingBarcode(null);
    setDirectLogOutcome({ barcode: result.barcode, ok });
  }

  async function runSearch() {
    // #198: onSubmitEditing had no guard against a search already in flight (unlike the Search
    // button's own `disabled` prop below) -- mashing Enter while typing fired overlapping requests.
    if (!query.trim() || searching) return;
    const seq = ++searchSeq.current;
    setSearching(true);
    setSearchError(null);
    setDirectLogOutcome(null);
    try {
      const found = await searchProducts(query.trim());
      if (searchSeq.current !== seq) return; // superseded by a newer search, or the sheet closed
      setResults(found);
    } catch (e) {
      if (searchSeq.current !== seq) return;
      setSearchError(String(e));
      setResults(null);
    } finally {
      if (searchSeq.current === seq) setSearching(false);
    }
  }

  function pickResult(result: OffSearchResult) {
    onAddOffResult(result);
    setQuery("");
    setResults(null);
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        {/* keyboardHeight (tracked above) pushes the sheet up by the keyboard's own height --
        KeyboardAvoidingView doesn't reach content mounted inside an Android Modal (confirmed
        on-device: its automatic height-tracking never engaged here at all), so this is done
        manually instead of via that component. */}
        <View style={{ marginBottom: keyboardHeight }}>
          <Animated.View style={[styles.sheet, panelStyle, { paddingBottom: spacing(6) + insets.bottom }]}>
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>
            <View style={styles.header}>
              <Text style={styles.title}>Your Plate</Text>
              {contextLabel ? <Text style={styles.context}>{contextLabel}</Text> : null}
            </View>

            <ScrollView ref={scrollRef} style={styles.scroll} keyboardShouldPersistTaps="handled">
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
                <View style={styles.addHeadingRow}>
                  <SearchIcon color={colors.maroon600} />
                  <View style={styles.addHeadingText}>
                    <Text style={styles.addHeading}>Add something else</Text>
                    <Text style={styles.addSub}>Search packaged foods (OpenFoodFacts) — for foods not on the menu</Text>
                  </View>
                </View>
                <View style={styles.searchRow}>
                  <TextInput
                    style={styles.searchInput}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search packaged foods"
                    placeholderTextColor={withOpacity(colors.ink900, 45)}
                    onSubmitEditing={runSearch}
                    // Even with the keyboardHeight fix above, this box sits after the item
                    // list/totals/LOG button in a plain ScrollView, which doesn't reliably scroll a
                    // newly-focused input into view on its own -- scroll it to the end (it's the
                    // last thing in the sheet) so the query stays visible while typing.
                    onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
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
                  <View key={r.barcode} style={styles.resultRow}>
                    <Pressable
                      style={styles.resultInfo}
                      onPress={() => pickResult(r)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${r.productName} to plate`}
                    >
                      <Text style={styles.resultLabel}>{r.productName}</Text>
                      <Text style={styles.resultCalories}>
                        {Math.round(r.nutrition.calories)} cal{isEstimatedServing(r.nutrition) ? " · est. per 100g" : ""}
                      </Text>
                      {directLogOutcome?.barcode === r.barcode && (
                        <Text style={directLogOutcome.ok ? styles.resultLogSuccess : styles.resultLogError}>
                          {directLogOutcome.ok ? "Logged" : "Couldn't log — try again"}
                        </Text>
                      )}
                    </Pressable>
                    <Button
                      variant="secondary"
                      size="sm"
                      onPress={() => logResultDirectly(r)}
                      disabled={loggingBarcode === r.barcode}
                      accessibilityLabel={`Log ${r.productName} now, without adding the rest of the plate`}
                    >
                      {loggingBarcode === r.barcode ? "…" : "Log"}
                    </Button>
                  </View>
                ))}
              </View>
            </ScrollView>
          </Animated.View>
        </View>
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
  addHeadingRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  addHeadingText: { flex: 1, gap: spacing(0.5) },
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
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing(2),
    paddingVertical: spacing(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: withOpacity(colors.ink900, 15),
  },
  resultInfo: { flex: 1, gap: 1 },
  resultLabel: { fontFamily: fonts.body400, fontSize: fs(14), color: colors.ink900 },
  resultCalories: { fontFamily: fonts.mono, fontSize: fs(13), color: withOpacity(colors.ink900, 60) },
  resultLogSuccess: { fontFamily: fonts.body600, fontSize: fs(12), color: colors.maroon600, marginTop: spacing(0.5) },
  resultLogError: { fontFamily: fonts.body600, fontSize: fs(12), color: "#b00020", marginTop: spacing(0.5) },
});
