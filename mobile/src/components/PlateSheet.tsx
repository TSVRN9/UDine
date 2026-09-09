import { searchProducts, type DailyMacroTotals, type LogStorage, type OffSearchResult } from "@udine/shared";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getCachedDishCatalog, refreshDishCatalogIfStale, searchCachedDishes } from "../lib/dishCatalog";
import { getLoggedUmassDishHistory, type HistoryDish } from "../lib/dishHistory";
import { isEstimatedServing, totalItemCount, type PlateEntry } from "../lib/plate";
import { formatServings, parseServingsInput } from "../lib/servingsStepper";
import { supabase } from "../lib/supabase";
import { Button, Stat } from "./ui";
import { useDraggableSheet } from "../lib/sheetAnimation";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

/** One merged search result: either a UMass-side dish (device log history, or the server dish
 * nutrition catalog cached locally -- see dishCatalog.ts) or an OpenFoodFacts packaged-food hit.
 * Tagged so the result row can badge it instead of the search box needing separate explanatory
 * headings per source. */
type PlateSearchResult = { kind: "umass"; dish: HistoryDish } | { kind: "off"; product: OffSearchResult };

interface Props {
  visible: boolean;
  plate: PlateEntry[];
  totals: DailyMacroTotals;
  /** Right-of-title context per the canvas ("Hampshire · Lunch") — the caller's hall name. */
  contextLabel?: string;
  /** Backs the local-history half of the merged search (getLoggedUmassDishHistory reads this
   * directly) -- halls/[slug].tsx already owns one SqliteLogStorage instance for logging, passed
   * straight through rather than duplicated here. */
  logStorage: LogStorage;
  /** The hall (or café) currently being browsed -- history search is scoped to this hallTid only,
   * never cross-hall (see dishHistory.ts's own doc: a re-added dish's hallTid feeds server-synced
   * hall-completion/favorite-hall derivation, so a cross-hall dedup could misattribute credit
   * between two halls sharing a dish name -- #344 review). A catalog-only hit is scoped to this
   * same hallTid when staged (see runSearch below). */
  hallTid: number;
  onStep: (key: string, delta: number) => void;
  /** Manual entry (tap the count, type an exact amount -- halves and any other decimal, not
   * just ±1 steps). Wired straight to plate.ts's setCount. */
  onSetCount: (key: string, count: number) => void;
  onAddOffResult: (result: OffSearchResult) => void;
  onAddHistoryDish: (dish: HistoryDish) => void;
  onLog: () => void;
  onClose: () => void;
  /** Café-screen unification: a standing-menu row with no catalog match ("add something else"
   * instead of a dead end) opens this sheet pre-seeded with its parsed name -- filled into the
   * search box AND searched immediately, not just typed in for the user to press Search again.
   * Undefined/absent for every other opener (the plain PlateBar tap), which starts on a blank box
   * same as before. The caller is expected to clear whatever it passed the moment `onClose` fires
   * (see halls/[slug].tsx), so reopening via the plain PlateBar tap afterward doesn't reseed. */
  initialQuery?: string;
}

/**
 * Expanded plate sheet (canvas: "Plate expanded") — a bottom sheet over a dimmed scrim: drag
 * handle, per-item steppers, totals grid, LOG N ITEMS, and a single merged search box (local
 * device history + the cached dish catalog + OpenFoodFacts, tagged per-row). A transparent RN
 * Modal, same structural call as NutritionLabel (see halls/[slug].tsx's note): no route, no
 * _layout.tsx change, no MenuItem serialization through router params.
 */
export function PlateSheet({ visible, plate, totals, contextLabel, logStorage, hallTid, onStep, onSetCount, onAddOffResult, onAddHistoryDish, onLog, onClose, initialQuery }: Props) {
  const [query, setQuery] = useState("");
  // Tap-to-type serving entry: which row's count is currently an editable TextInput (null = none
  // are). Only one row edits at a time -- starting a new one commits whatever was already typed
  // into the row being left, rather than relying on TextInput's onBlur firing before it unmounts
  // (RN doesn't guarantee that ordering when the conditional swaps the child out from under it).
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [results, setResults] = useState<PlateSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const { gesture, backdropStyle, panelStyle, modalVisible } = useDraggableSheet(visible, onClose, fs(640));
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
  // PlateSheet stays mounted across open/close (only the Modal's `visible` prop toggles) --
  // mount-once is the right place to fire off a background catalog refresh. Fire-and-forget:
  // refreshDishCatalogIfStale already swallows its own errors, and this screen must never block on
  // (or fail because of) a background sync.
  useEffect(() => {
    refreshDishCatalogIfStale(supabase);
  }, []);
  // #198: bumped on every new search and on close -- a resolving search only applies its result if
  // this still matches the seq it captured when it started, so a slower/stale response can never
  // overwrite a newer query's results (or repaint a sheet the user closed). Local history/catalog
  // lookups resolve fast, but the one real network call (searchProducts) can still be slow -- the
  // whole merged result is gated behind this seq so the OFF portion can never land stale.
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
      setEditingKey(null);
    }
  }, [visible]);

  function beginEditingCount(entry: PlateEntry) {
    if (editingKey && editingKey !== entry.key) commitEditingCount();
    setEditingKey(entry.key);
    setEditingText(formatServings(entry.count));
  }

  // Invalid/empty input (parseServingsInput returns null) leaves the count untouched rather than
  // falling back to Number("")'s 0, which setCount would treat as "remove this row".
  function commitEditingCount() {
    if (editingKey) {
      const parsed = parseServingsInput(editingText);
      if (parsed !== null) onSetCount(editingKey, parsed);
    }
    setEditingKey(null);
  }

  // Seeds the search box (and runs the search) the instant a caller opens this sheet with a
  // pre-filled query (see initialQuery's own doc) -- keyed on `[visible, initialQuery]`, not just
  // `initialQuery`, so re-showing the SAME seed after a close (visible false -> true again) fires
  // again rather than being silently swallowed by React bailing out on an unchanged prop.
  // `runSearch(initialQuery)` (not a bare `runSearch()` after `setQuery`) -- setQuery is
  // async/batched, so a same-tick runSearch() would still close over the PREVIOUS render's `query`.
  // `runSearch` deliberately NOT a dependency here -- it closes over `query`/`searching`/etc, all
  // irrelevant to "did a NEW seed just arrive," and it's a fresh function identity every render, so
  // listing it would refire this on every keystroke-driven re-render, not just a fresh seed.
  useEffect(() => {
    if (visible && initialQuery) {
      setQuery(initialQuery);
      runSearch(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialQuery]);

  async function runSearch(queryOverride?: string) {
    // #198: onSubmitEditing had no guard against a search already in flight (unlike the Search
    // button's own `disabled` prop below) -- mashing Enter while typing fired overlapping requests.
    const raw = queryOverride ?? query;
    if (!raw.trim() || searching) return;
    const q = raw.trim();
    const seq = ++searchSeq.current;
    setSearching(true);
    setSearchError(null);
    try {
      const [historySettled, catalogSettled, offSettled] = await Promise.allSettled([
        getLoggedUmassDishHistory(logStorage, hallTid, q),
        getCachedDishCatalog().then((catalog) => searchCachedDishes(catalog, q)),
        searchProducts(q),
      ]);
      if (searchSeq.current !== seq) return; // superseded by a newer search, or the sheet closed

      const rejections = [historySettled, catalogSettled, offSettled].filter((r): r is PromiseRejectedResult => r.status === "rejected");

      const history = historySettled.status === "fulfilled" ? historySettled.value : [];
      const catalogHits = catalogSettled.status === "fulfilled" ? catalogSettled.value : [];
      const off = offSettled.status === "fulfilled" ? offSettled.value : [];

      // Merge the two UMass-side sources by dishName (case-insensitive). Local history wins on a
      // name collision -- it's already confirmed-logged at this exact hall, no network dependency.
      // A catalog-only hit is staged as a HistoryDish scoped to the CURRENTLY-BROWSED hall so it
      // flows through the existing historyDishToPlateEntry/onAddHistoryDish path unchanged.
      const umassByName = new Map<string, HistoryDish>();
      for (const entry of catalogHits) {
        umassByName.set(entry.dishName.toLowerCase(), { dishName: entry.dishName, hallTid, nutrition: entry.nutrition });
      }
      for (const dish of history) {
        umassByName.set(dish.dishName.toLowerCase(), dish); // history wins on collision
      }

      const merged: PlateSearchResult[] = [
        ...[...umassByName.values()].map((dish): PlateSearchResult => ({ kind: "umass", dish })),
        ...off.map((product): PlateSearchResult => ({ kind: "off", product })),
      ];

      // A rejection is only surfaced as a failure when it left the user with nothing: a real hit
      // from a surviving source is still useful, and pairing it with "Search failed" text would be
      // more confusing than helpful, so a partial failure alongside results is silently treated as
      // a success. But an EMPTY merged result plus any rejection is NOT the same as "genuinely no
      // matches" -- previously only an all-three-rejected search showed the failure text, so e.g. a
      // rejected OpenFoodFacts call alongside two sources that both legitimately resolved empty
      // (the common case) fell through to "No matches", lying to the user about why nothing showed.
      if (merged.length === 0 && rejections.length > 0) {
        setSearchError(String(rejections[0].reason));
        setResults(null);
        return;
      }

      setSearchError(null);
      setResults(merged);
    } finally {
      if (searchSeq.current === seq) setSearching(false);
    }
  }

  function pickResult(result: PlateSearchResult) {
    if (result.kind === "umass") onAddHistoryDish(result.dish);
    else onAddOffResult(result.product);
    setQuery("");
    setResults(null);
  }

  return (
    <Modal visible={modalVisible} transparent animationType="none" onRequestClose={onClose}>
      {/* RNGH's own documented caveat: a root-level GestureHandlerRootView (mobile/src/app/_layout.tsx)
      doesn't reliably propagate into a Modal's separate native host/window, so each sheet nests its
      own here -- see this PR's own body for what the on-device spike confirmed. */}
      <GestureHandlerRootView style={styles.backdrop}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        {/* keyboardHeight (tracked above) pushes the sheet up by the keyboard's own height --
        KeyboardAvoidingView doesn't reach content mounted inside an Android Modal (confirmed
        on-device: its automatic height-tracking never engaged here at all), so this is done
        manually instead of via that component. */}
        <View style={{ marginBottom: keyboardHeight }}>
          <Animated.View style={[styles.sheet, panelStyle, { paddingBottom: spacing(6) + insets.bottom }]}>
            <GestureDetector gesture={gesture}>
              <View style={styles.handleRow}>
                <View style={styles.handle} />
              </View>
            </GestureDetector>
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
                      {editingKey === entry.key ? (
                        <TextInput
                          style={styles.stepperInput}
                          value={editingText}
                          onChangeText={setEditingText}
                          keyboardType="decimal-pad"
                          autoFocus
                          selectTextOnFocus
                          onSubmitEditing={commitEditingCount}
                          onBlur={commitEditingCount}
                          accessibilityLabel={`Servings for ${entry.label}`}
                        />
                      ) : (
                        <Pressable onPress={() => beginEditingCount(entry)} accessibilityRole="button" accessibilityLabel={`Edit servings for ${entry.label}`}>
                          <Text style={styles.stepperCount}>{formatServings(entry.count)}</Text>
                        </Pressable>
                      )}
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
                {`LOG ${formatServings(itemCount)} ${itemCount === 1 ? "ITEM" : "ITEMS"}`}
              </Button>

              <View style={styles.addSection}>
                <View style={styles.searchRow}>
                  <TextInput
                    style={styles.searchInput}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search for a food"
                    placeholderTextColor={withOpacity(colors.ink900, 45)}
                    onSubmitEditing={() => runSearch()}
                    // This box sits after the item list/totals/LOG button in a plain ScrollView,
                    // which doesn't reliably scroll a newly-focused input into view on its own --
                    // scroll it to the end (it's the last thing in the sheet) so the query stays
                    // visible while typing.
                    onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                    returnKeyType="search"
                  />
                  <Button variant="secondary" size="sm" onPress={() => runSearch()} disabled={searching || !query.trim()}>
                    Search
                  </Button>
                </View>
                {searching && <ActivityIndicator color={colors.maroon600} style={styles.searchSpinner} />}
                {searchError && <Text style={styles.searchError}>Search failed: {searchError}</Text>}
                {results?.length === 0 && !searching && <Text style={styles.searchHint}>No matches.</Text>}
                {results?.map((r) => {
                  const key = r.kind === "umass" ? `umass:${r.dish.hallTid}:${r.dish.dishName}` : `off:${r.product.barcode}`;
                  const label = r.kind === "umass" ? r.dish.dishName : r.product.productName;
                  const nutrition = r.kind === "umass" ? r.dish.nutrition : r.product.nutrition;
                  return (
                    <View key={key} style={styles.resultRow}>
                      <Pressable
                        style={styles.resultInfo}
                        onPress={() => pickResult(r)}
                        accessibilityRole="button"
                        // The badge (UMass/Packaged) is visual-only -- an explicit accessibilityLabel
                        // replaces the Pressable's rendered text for assistive tech, so the source
                        // distinction has to be spelled out here too, or a screen-reader user gets two
                        // indistinguishable "Add Pizza to plate" actions on a name collision.
                        accessibilityLabel={`Add ${label} to plate (${r.kind === "umass" ? "UMass" : "packaged"})`}
                      >
                        <View style={styles.resultHeaderRow}>
                          <Text style={styles.resultLabel}>{label}</Text>
                          <View style={styles.badge}>
                            <Text style={styles.badgeText}>{r.kind === "umass" ? "UMass" : "Packaged"}</Text>
                          </View>
                        </View>
                        <Text style={styles.resultCalories}>
                          {Math.round(nutrition.calories)} cal{isEstimatedServing(nutrition) ? " · est. per 100g" : ""}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
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
  // paddingVertical bumped from a bare 0 to spacing(5) (~20dp a side): the 40x4 pill alone was far
  // too small a real touch/drag target -- ~44dp of touchable height (handle + padding) is the usual
  // minimum for a draggable handle.
  handleRow: { alignItems: "center", paddingVertical: spacing(5), marginBottom: spacing(2.5) },
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
  // minWidth 34 (was 24): fits "1.5" without the pill visibly resizing on every fractional count.
  stepperCount: { fontFamily: fonts.mono, fontSize: fs(14), fontWeight: "600", minWidth: 34, textAlign: "center", color: colors.ink900 },
  stepperInput: {
    fontFamily: fonts.mono,
    fontSize: fs(14),
    fontWeight: "600",
    minWidth: 34,
    textAlign: "center",
    color: colors.ink900,
    borderWidth: 1.5,
    borderColor: colors.gold500,
    borderRadius: radii.sm,
    paddingVertical: 2,
    paddingHorizontal: spacing(1),
  },

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
  searchRow: { flexDirection: "row", gap: spacing(2), alignItems: "center" },
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
  resultHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing(1.5) },
  resultLabel: { fontFamily: fonts.body400, fontSize: fs(14), color: colors.ink900 },
  resultCalories: { fontFamily: fonts.mono, fontSize: fs(13), color: withOpacity(colors.ink900, 60) },
  badge: {
    borderWidth: 1,
    borderColor: withOpacity(colors.maroon600, 45),
    borderRadius: radii.pill,
    paddingHorizontal: spacing(1.5),
    paddingVertical: 1,
  },
  badgeText: { fontFamily: fonts.mono, fontSize: fs(10), letterSpacing: 0.5, textTransform: "uppercase", color: colors.maroon600 },
});
