import { searchBrandedFoods, searchFoods, searchProducts, type CustomFoodsStorage, type DailyMacroTotals, type LogStorage } from "@udine/shared";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { searchCustomFoods } from "../lib/customFoodsStorage";
import { getCachedDishCatalog, refreshDishCatalogIfStale, searchCachedDishes } from "../lib/dishCatalog";
import { getLoggedUmassDishHistory, type HistoryDish } from "../lib/dishHistory";
import { isEstimatedServing, plateSearchResultDetail, plateSearchResultKey, totalItemCount, type PlateEntry, type PlateSearchResult } from "../lib/plate";
import { formatServings, parseServingsInput } from "../lib/servingsStepper";
import { supabase } from "../lib/supabase";
import { Button, Stat } from "./ui";
import { useDraggableSheet } from "../lib/sheetAnimation";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

/** Per-kind badge label/fill/text -- PlateSearchResult (lib/plate.ts) is the merged-search tagged
 * union this reads off of. Filled pills per PlateSheetResults.dc.html:49,60,71,82,93. */
const BADGE_INFO: Record<PlateSearchResult["kind"], { label: string; fill: string; color: string }> = {
  umass: { label: "UMass", fill: "rgba(59,10,15,0.08)", color: "#3b0a0f" },
  custom: { label: "Custom", fill: "rgba(201,154,46,0.16)", color: "#8a6a1a" },
  off: { label: "Packaged", fill: "rgba(36,26,20,0.08)", color: "rgba(36,26,20,0.65)" },
  usda: { label: "USDA", fill: "rgba(92,112,72,0.16)", color: "#4a5c3a" },
};

// Mirrors the (unexported) page size both networked search sources use, for the "Load N More"
// button copy.
const SEARCH_PAGE_SIZE = 20;

interface Props {
  visible: boolean;
  plate: PlateEntry[];
  totals: DailyMacroTotals;
  /** Right-of-title context (e.g. "Hampshire · Lunch") — the caller's hall name. */
  contextLabel?: string;
  /** Backs the local-history half of the merged search. Caller passes its own LogStorage instance
   * through rather than this sheet owning a duplicate. */
  logStorage: LogStorage;
  /** Backs the custom-food half of the merged search, same pass-through convention as logStorage. */
  customFoodsStorage: CustomFoodsStorage;
  /** The hall (or café) currently being browsed -- history search is scoped to this hallTid only,
   * never cross-hall (a re-added dish's hallTid feeds server-synced hall-completion/favorite-hall
   * derivation, so cross-hall dedup could misattribute credit between two halls sharing a dish
   * name). A catalog-only hit is scoped to this same hallTid when staged. */
  hallTid: number;
  onStep: (key: string, delta: number) => void;
  /** Manual entry (tap the count, type an exact amount -- halves and any other decimal, not
   * just ±1 steps). Wired straight to plate.ts's setCount. */
  onSetCount: (key: string, count: number) => void;
  /** Tapping any search result opens the shared NutritionLabel confirm/detail step -- lifted to the
   * caller rather than nested inside this sheet's own Modal (no Modal-in-Modal precedent in this
   * codebase). The caller renders NutritionLabel as a sibling; its onAddToPlate actually adds the
   * result to the plate. */
  onShowResultDetail: (result: PlateSearchResult) => void;
  /** The standing "Can't find it? Create a custom food" footer row -- also lifted to the caller for
   * the same nested-Modal reason. Prefilled with whatever's currently typed in the search box. */
  onOpenCustomFoodForm: (prefillName: string | undefined) => void;
  onLog: () => void;
  onClose: () => void;
  /** A standing-menu row with no catalog match opens this sheet pre-seeded with its parsed name --
   * filled into the search box AND searched immediately. Undefined for every other opener (the
   * plain PlateBar tap), which starts on a blank box. The caller clears this the moment `onClose`
   * fires, so reopening via the plain PlateBar tap afterward doesn't reseed. */
  initialQuery?: string;
}

/**
 * Expanded plate sheet -- a bottom sheet over a dimmed scrim: drag handle, per-item steppers,
 * totals grid, LOG N ITEMS, and a single merged search box (local device history + the cached dish
 * catalog + OpenFoodFacts + USDA FoodData Central + saved custom foods, tagged per-row). A
 * transparent RN Modal: no route, no _layout.tsx change, no MenuItem serialization through router
 * params.
 */
export function PlateSheet({
  visible,
  plate,
  totals,
  contextLabel,
  logStorage,
  customFoodsStorage,
  hallTid,
  onStep,
  onSetCount,
  onShowResultDetail,
  onOpenCustomFoodForm,
  onLog,
  onClose,
  initialQuery,
}: Props) {
  const [query, setQuery] = useState("");
  // Tap-to-type serving entry: which row's count is currently an editable TextInput (null = none
  // are). Only one row edits at a time -- starting a new one commits whatever was already typed
  // into the row being left, rather than relying on TextInput's onBlur firing before it unmounts
  // (RN doesn't guarantee that ordering when the conditional swaps the child out from under it).
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  // "Add something else" starts idle (dashed row, no live input) until tapped. Auto-expanded by
  // the initialQuery effect below since that path seeds and runs a search immediately.
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [results, setResults] = useState<PlateSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Pagination cursors for the networked sources (OFF/USDA/Branded) -- umass history/catalog and
  // custom foods are local device queries with no meaningful "next page" of their own. Reset on
  // every fresh search (runSearch) and advanced by loadMore below.
  const [offPage, setOffPage] = useState(1);
  const [offHasMore, setOffHasMore] = useState(false);
  const [usdaPage, setUsdaPage] = useState(1);
  const [usdaHasMore, setUsdaHasMore] = useState(false);
  // Branded (USDA FDC, dataType=Branded) is a second, independent parallel call alongside the
  // Foundation/SR Legacy one above -- same "usda" PlateSearchResult kind/badge, its own pagination
  // cursor since it's its own paged endpoint call.
  const [brandedPage, setBrandedPage] = useState(1);
  const [brandedHasMore, setBrandedHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const insets = useSafeAreaInsets();
  const { gesture, backdropStyle, panelStyle, modalVisible } = useDraggableSheet(visible, onClose, fs(640));
  const scrollRef = useRef<ScrollView>(null);
  // KeyboardAvoidingView's automatic height-tracking doesn't reach content mounted inside an
  // Android RN Modal -- tracked manually instead via RN's own Keyboard API.
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
  // Bumped on every new search and on close -- a resolving search only applies its result if this
  // still matches the seq it captured when it started, so a slower/stale response can never
  // overwrite a newer query's results (or repaint a sheet the user closed).
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
      setSearchExpanded(false);
      setOffPage(1);
      setOffHasMore(false);
      setUsdaPage(1);
      setUsdaHasMore(false);
      setBrandedPage(1);
      setBrandedHasMore(false);
      setLoadingMore(false);
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
  // pre-filled query. Keyed on [visible, initialQuery], not just initialQuery, so re-showing the
  // same seed after a close fires again instead of React bailing out on an unchanged prop.
  // runSearch(initialQuery), not a bare runSearch() after setQuery -- setQuery is async/batched, so
  // a same-tick runSearch() would still close over the previous render's query. runSearch itself is
  // deliberately not a dependency -- it's a fresh identity every render, which would refire this on
  // every keystroke.
  useEffect(() => {
    if (visible && initialQuery) {
      setQuery(initialQuery);
      setSearchExpanded(true);
      runSearch(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialQuery]);

  async function runSearch(queryOverride?: string) {
    // Guards against a search already in flight -- mashing Enter while typing would otherwise fire
    // overlapping requests.
    const raw = queryOverride ?? query;
    if (!raw.trim() || searching) return;
    const q = raw.trim();
    const seq = ++searchSeq.current;
    setSearching(true);
    setSearchError(null);
    try {
      const [historySettled, catalogSettled, offSettled, usdaSettled, brandedSettled, customSettled] = await Promise.allSettled([
        getLoggedUmassDishHistory(logStorage, hallTid, q),
        getCachedDishCatalog().then((catalog) => searchCachedDishes(catalog, q)),
        searchProducts(q),
        searchFoods(q),
        searchBrandedFoods(q),
        customFoodsStorage.getAllCustomFoods().then((foods) => searchCustomFoods(foods, q)),
      ]);
      if (searchSeq.current !== seq) return; // superseded by a newer search, or the sheet closed

      const rejections = [historySettled, catalogSettled, offSettled, usdaSettled, brandedSettled, customSettled].filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );

      const history = historySettled.status === "fulfilled" ? historySettled.value : [];
      const catalogHits = catalogSettled.status === "fulfilled" ? catalogSettled.value : [];
      const off = offSettled.status === "fulfilled" ? offSettled.value : { results: [], hasMore: false };
      const usda = usdaSettled.status === "fulfilled" ? usdaSettled.value : { results: [], hasMore: false };
      const branded = brandedSettled.status === "fulfilled" ? brandedSettled.value : { results: [], hasMore: false };
      const custom = customSettled.status === "fulfilled" ? customSettled.value : [];

      // Merge the two UMass-side sources by dishName (case-insensitive). Local history wins on a
      // name collision -- it's already confirmed-logged at this exact hall, no network dependency.
      // A catalog-only hit is staged as a HistoryDish scoped to the CURRENTLY-BROWSED hall so it
      // flows through the existing historyDishToPlateEntry path unchanged.
      const umassByName = new Map<string, HistoryDish>();
      for (const entry of catalogHits) {
        umassByName.set(entry.dishName.toLowerCase(), { dishName: entry.dishName, hallTid, nutrition: entry.nutrition });
      }
      for (const dish of history) {
        umassByName.set(dish.dishName.toLowerCase(), dish); // history wins on collision
      }

      const merged: PlateSearchResult[] = [
        ...[...umassByName.values()].map((dish): PlateSearchResult => ({ kind: "umass", dish })),
        ...custom.map((food): PlateSearchResult => ({ kind: "custom", food })),
        ...off.results.map((product): PlateSearchResult => ({ kind: "off", product })),
        ...usda.results.map((food): PlateSearchResult => ({ kind: "usda", food })),
        ...branded.results.map((food): PlateSearchResult => ({ kind: "usda", food })),
      ];

      // A rejection is only surfaced as a failure when it left the user with nothing: a real hit
      // from a surviving source is still useful, and pairing it with "Search failed" text would be
      // more confusing than helpful, so a partial failure alongside results is silently treated as
      // a success. But an EMPTY merged result plus any rejection is NOT the same as "genuinely no
      // matches" -- previously only an all-rejected search showed the failure text, so e.g. a
      // rejected OpenFoodFacts call alongside sources that all legitimately resolved empty (the
      // common case) fell through to "No matches", lying to the user about why nothing showed.
      if (merged.length === 0 && rejections.length > 0) {
        // Generic, honest copy -- never the raw rejection, which leaks implementation details.
        // `results` stays null (not []) since [] would also trigger the "No matches" hint below,
        // which reads as confusing alongside an error. The footer's gating condition is widened
        // instead, so the "Create a custom food" escape hatch stays available here too.
        setSearchError("please try again, or create a custom food below");
        setResults(null);
        setOffHasMore(false);
        setUsdaHasMore(false);
        setBrandedHasMore(false);
        return;
      }

      setSearchError(null);
      setResults(merged);
      setOffPage(1);
      setUsdaPage(1);
      setBrandedPage(1);
      setOffHasMore(off.hasMore);
      setUsdaHasMore(usda.hasMore);
      setBrandedHasMore(branded.hasMore);
    } finally {
      if (searchSeq.current === seq) setSearching(false);
    }
  }

  /** Fetches the next page of whichever of OFF/USDA/Branded still has more and appends the new
   * hits -- umass history/catalog and custom foods are local, unpaginated queries with no "next
   * page" of their own. */
  async function loadMore() {
    if (loadingMore || (!offHasMore && !usdaHasMore && !brandedHasMore)) return;
    const q = query.trim();
    if (!q) return;
    const seq = searchSeq.current; // gated the same way runSearch is -- a stale response must not append onto a newer/closed search
    setLoadingMore(true);
    try {
      const [offSettled, usdaSettled, brandedSettled] = await Promise.allSettled([
        offHasMore ? searchProducts(q, offPage + 1) : Promise.resolve(null),
        usdaHasMore ? searchFoods(q, usdaPage + 1) : Promise.resolve(null),
        brandedHasMore ? searchBrandedFoods(q, brandedPage + 1) : Promise.resolve(null),
      ]);
      if (searchSeq.current !== seq) return;

      const off = offSettled.status === "fulfilled" ? offSettled.value : null;
      const usda = usdaSettled.status === "fulfilled" ? usdaSettled.value : null;
      const branded = brandedSettled.status === "fulfilled" ? brandedSettled.value : null;

      const additions: PlateSearchResult[] = [
        ...(off?.results.map((product): PlateSearchResult => ({ kind: "off", product })) ?? []),
        ...(usda?.results.map((food): PlateSearchResult => ({ kind: "usda", food })) ?? []),
        ...(branded?.results.map((food): PlateSearchResult => ({ kind: "usda", food })) ?? []),
      ];
      if (additions.length > 0) setResults((prev) => [...(prev ?? []), ...additions]);
      if (off) {
        setOffPage((p) => p + 1);
        setOffHasMore(off.hasMore);
      }
      if (usda) {
        setUsdaPage((p) => p + 1);
        setUsdaHasMore(usda.hasMore);
      }
      if (branded) {
        setBrandedPage((p) => p + 1);
        setBrandedHasMore(branded.hasMore);
      }
    } finally {
      if (searchSeq.current === seq) setLoadingMore(false);
    }
  }

  return (
    <Modal visible={modalVisible} transparent animationType="none" onRequestClose={onClose}>
      {/* A root-level GestureHandlerRootView doesn't reliably propagate into a Modal's separate
      native host/window, so each sheet nests its own here. */}
      <GestureHandlerRootView style={styles.backdrop}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        {/* keyboardHeight (tracked above) pushes the sheet up by the keyboard's own height, since
        KeyboardAvoidingView doesn't reach content mounted inside an Android Modal. */}
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
                    <View style={[styles.stepper, editingKey === entry.key && styles.stepperEditing]}>
                      <Pressable
                        style={[styles.stepperButton, editingKey === entry.key && styles.stepperButtonEditing]}
                        onPress={() => onStep(entry.key, -1)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove one ${entry.label}`}
                      >
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
                      <Pressable
                        style={[styles.stepperButton, editingKey === entry.key && styles.stepperButtonEditing]}
                        onPress={() => onStep(entry.key, 1)}
                        accessibilityRole="button"
                        accessibilityLabel={`Add one ${entry.label}`}
                      >
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

              {searchExpanded ? (
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
                    const key = plateSearchResultKey(r);
                    const detail = plateSearchResultDetail(r);
                    const badge = BADGE_INFO[r.kind];
                    return (
                      <View key={key} style={styles.resultRow}>
                        <Pressable
                          style={styles.resultInfo}
                          onPress={() => onShowResultDetail(r)}
                          accessibilityRole="button"
                          // The badge is visual-only, so the source distinction is spelled out here
                          // too, or a screen-reader user gets two indistinguishable "View Pizza"
                          // actions on a name collision. "View", not "Add" -- tapping a result opens
                          // the confirm/detail step, not an instant add.
                          accessibilityLabel={`View ${detail.dishName} (${badge.label})`}
                        >
                          <View style={styles.resultHeaderRow}>
                            <Text style={styles.resultLabel}>{detail.dishName}</Text>
                            <View style={[styles.badge, { backgroundColor: badge.fill }]}>
                              <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                            </View>
                          </View>
                          <Text style={styles.resultCalories}>
                            {Math.round(detail.nutrition.calories)} cal{isEstimatedServing(detail.nutrition) ? " · est. per 100g" : ""}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                  {(offHasMore || usdaHasMore || brandedHasMore) && (
                    <Button variant="ghost" size="sm" style={styles.loadMoreButton} textStyle={styles.loadMoreButtonText} onPress={loadMore} disabled={loadingMore}>
                      {loadingMore ? "Loading…" : `Load ${SEARCH_PAGE_SIZE} More`}
                    </Button>
                  )}
                  {/* Standing footer row -- shown whenever a search has actually run, whether or
                  not it found anything, since no database this sheet searches has every food. Also
                  shown on the all-rejected error branch, when the user most needs this escape hatch. */}
                  {(results !== null || searchError !== null) && (
                    <Pressable
                      style={styles.customFoodRow}
                      onPress={() => onOpenCustomFoodForm(query.trim() || undefined)}
                      accessibilityRole="button"
                      accessibilityLabel="Create a custom food"
                    >
                      <Text style={styles.customFoodRowIcon}>+</Text>
                      <Text style={styles.customFoodRowText}>Can&apos;t find it? Create a custom food</Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                // Idle state (PlateExpanded.dc.html:87-93). The artboard's hint copy mentions
                // barcode scanning, but no such feature exists in this app, so that clause is dropped.
                <Pressable
                  style={[styles.addSection, styles.addSectionIdle]}
                  onPress={() => setSearchExpanded(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Add something else"
                >
                  {/* Magnifying-glass glyph per PlateExpanded.dc.html:87. */}
                  <Svg width={fs(20)} height={fs(20)} viewBox="0 0 20 20" fill="none">
                    <Circle cx={9} cy={9} r={5.5} stroke={colors.maroon600} strokeWidth={1.6} />
                    <Path d="M13.5 13.5L17 17" stroke={colors.maroon600} strokeWidth={1.6} strokeLinecap="round" />
                  </Svg>
                  <View style={styles.addIdleText}>
                    <Text style={styles.addIdleTitle}>Add something else</Text>
                    <Text style={styles.addIdleHint}>Search for foods not on the menu.</Text>
                  </View>
                </Pressable>
              )}
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
    // PlateExpanded.dc.html:27 & ServingsG.dc.html:27 -- box-shadow: 0 -8px 24px rgba(36,26,20,0.25).
    shadowColor: colors.ink900,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  // paddingVertical spacing(5), ~20dp a side -- the bare 40x4 pill alone is too small a touch/drag target.
  handleRow: { alignItems: "center", paddingVertical: spacing(5), marginBottom: spacing(2.5) },
  handle: { width: fs(40), height: 4, borderRadius: radii.pill, backgroundColor: withOpacity(colors.ink900, 20) },
  // marginBottom 14 (spacing(3.5)), matching PlateExpanded.dc.html:27's uniform 14px section gap.
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: spacing(3.5) },
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
  // ServingsG.dc.html:56-57 -- narrower 38px +/- buttons, only for the row in edit mode.
  stepperEditing: { gap: spacing(1.5), paddingHorizontal: 3 },
  stepperButtonEditing: { width: fs(38) },
  stepperButtonText: { fontSize: fs(18), color: colors.maroon600 },
  // minWidth 34 fits "1.5" without the pill visibly resizing on every fractional count.
  stepperCount: { fontFamily: fonts.mono, fontSize: fs(14), fontWeight: "600", minWidth: 34, textAlign: "center", color: colors.ink900 },
  // ServingsG.dc.html:58-59 -- minWidth 46/height 32/radius 8, text 15px/#3b0a0f.
  stepperInput: {
    fontFamily: fonts.mono,
    fontSize: fs(15),
    fontWeight: "600",
    minWidth: fs(46),
    height: fs(32),
    textAlign: "center",
    color: colors.maroon900,
    borderWidth: 1.5,
    borderColor: colors.gold500,
    borderRadius: 8,
    paddingHorizontal: spacing(1),
  },
  divider: { height: 1, backgroundColor: withOpacity(colors.ink900, 12), marginVertical: spacing(3.5) },

  totalsRow: { flexDirection: "row", gap: spacing(2.5), marginBottom: spacing(3.5) },
  totalCell: { flex: 1 },

  logButton: { height: fs(52), borderRadius: radii.md },
  logButtonText: { fontFamily: fonts.display600, fontSize: fs(16), letterSpacing: 1, textTransform: "uppercase" },

  // PlateExpanded.dc.html:87-93 -- asymmetric 12px/14px padding and a 44px min-height. Doubles as
  // both the idle row's own box and the expanded search area's wrapper. Base border is the
  // expanded state's plain solid one; the idle-only dashed maroon border is layered on by
  // addSectionIdle below -- it must not wrap the whole active search area.
  addSection: {
    marginTop: spacing(3.5),
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 20),
    borderRadius: radii.md,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3.5),
    minHeight: fs(44),
    gap: spacing(1),
  },
  addSectionIdle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    borderStyle: "dashed",
    borderColor: withOpacity(colors.maroon600, 45),
  },
  addIdleText: { flexShrink: 1, gap: 0 },
  addIdleTitle: { fontFamily: fonts.body600, fontSize: fs(13), color: colors.maroon600 },
  addIdleHint: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.ink900, 55) },
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
  // flexShrink: 1 -- without it this Text refuses to shrink below its own content width (RN/Yoga
  // default), so a long dish/product name pushes the sibling kind badge off the row's right edge.
  resultLabel: { flexShrink: 1, fontFamily: fonts.body400, fontSize: fs(14), color: colors.ink900 },
  resultCalories: { fontFamily: fonts.mono, fontSize: fs(13), color: withOpacity(colors.ink900, 60) },
  // PlateSheetResults.dc.html:49,60,71,82,93 -- filled pill, no border, 9px/700 sans-serif at
  // 0.4px letterspacing, 2px/6px padding. fonts.body600 is the closest loaded weight to the spec's
  // 700 -- an explicit fontWeight on a lighter family fake-bolds it on Android.
  badge: {
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontFamily: fonts.body600, fontSize: fs(9), letterSpacing: 0.4, textTransform: "uppercase" },
  // PlateSheetResults.dc.html:99 -- Oswald/600/12px uppercase with a visible border.
  loadMoreButton: { alignSelf: "center", marginTop: spacing(1.5), borderWidth: 1, borderColor: withOpacity(colors.ink900, 20), borderRadius: 6 },
  loadMoreButtonText: { fontFamily: fonts.display600, fontSize: fs(12), letterSpacing: 0.8, textTransform: "uppercase", color: withOpacity(colors.ink900, 65) },
  // PlateSheetResults.dc.html:103 -- a dashed box with a "+" icon.
  customFoodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2.5),
    marginTop: spacing(1.5),
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: withOpacity(colors.maroon600, 45),
    borderRadius: 6,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3.5),
  },
  customFoodRowIcon: { fontSize: fs(16), fontWeight: "700", color: colors.maroon600 },
  customFoodRowText: { flex: 1, fontFamily: fonts.body600, fontSize: fs(13), color: colors.maroon600 },
});
