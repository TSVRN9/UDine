import { type FoodPreferences, type MacroPreset, type MenuItem } from "@udine/shared";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toggleAllergen, toggleDietTag, toggleMacroPreset } from "../lib/preferences";
import { useDraggableSheet } from "../lib/sheetAnimation";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

/** The 3 price buckets the Price section groups a feed price string into -- see priceBucketFor. */
export type PriceBucket = "under-5" | "5-10" | "10-plus";

export const ALL_MACRO_PRESETS: MacroPreset[] = ["high-protein", "low-sodium", "under-500-cal", "low-fat", "high-fiber"];

export const MACRO_PRESET_LABELS: Record<MacroPreset, string> = {
  "high-protein": "High Protein",
  "low-sodium": "Low Sodium",
  "under-500-cal": "Under 500 Cal",
  "low-fat": "Low Fat",
  "high-fiber": "High Fiber",
};

const PRICE_BUCKETS: PriceBucket[] = ["under-5", "5-10", "10-plus"];
const PRICE_BUCKET_LABELS: Record<PriceBucket, string> = {
  "under-5": "Under $5",
  "5-10": "$5–$10",
  "10-plus": "$10+",
};

/** Which of the 3 price buckets a feed price string ("$3.00") falls into -- null for anything that
 * doesn't parse (defensive; every known retail price is a well-formed "$"+number per MenuItem.price's
 * own doc comment, so this should never actually happen on real data). */
export function priceBucketFor(price: string): PriceBucket | null {
  const n = parseFloat(price.replace("$", ""));
  if (Number.isNaN(n)) return null;
  if (n < 5) return "under-5";
  if (n <= 10) return "5-10";
  return "10-plus";
}

/** DISTINCT station (category) names actually present in `items`, trimmed -- the feed publishes
 * trailing whitespace on some categories (e.g. "Grab n'Go Hot ", confirmed in grabNGo.test.ts) -- and
 * sorted for a stable checklist order. Ephemeral: this is never persisted, just what's on THIS menu. */
export function distinctStations(items: MenuItem[]): string[] {
  return [...new Set(items.map((i) => i.category.trim()))].sort();
}

/** True if `item` passes the ephemeral station/price filters (an empty filter set means "no
 * restriction selected", same convention for both) -- exported so the screen that owns this ephemeral
 * state can filter its own item list BEFORE it reaches hallMenuSections.ts, which stays
 * allergens/diet-tags only per CLAUDE.md (macros/station/price never filter there). */
export function itemMatchesStationAndPriceFilter(item: MenuItem, stationFilter: ReadonlySet<string>, priceFilter: ReadonlySet<PriceBucket>): boolean {
  if (stationFilter.size > 0 && !stationFilter.has(item.category.trim())) return false;
  if (priceFilter.size > 0) {
    const bucket = item.price ? priceBucketFor(item.price) : null;
    if (bucket === null || !priceFilter.has(bucket)) return false;
  }
  return true;
}

interface Props {
  visible: boolean;
  /** The screen's full, UNFILTERED item list -- Avoid Allergens/Require Diet Tags/Stations Here/
   * Price options (and the "does Price even apply" check) are all derived from this, not from an
   * already station/price-filtered list, or picking one filter would make the others' own options
   * disappear out from under the user. */
  items: MenuItem[];
  prefs: FoodPreferences;
  onChangePreferences: (next: FoodPreferences) => void;
  /** Ephemeral, parent-owned, never persisted -- resets whenever the parent screen/sheet resets it
   * (see Clear All below and the screen's own reopen handling). */
  stationFilter: ReadonlySet<string>;
  onChangeStationFilter: (next: Set<string>) => void;
  priceFilter: ReadonlySet<PriceBucket>;
  onChangePriceFilter: (next: Set<PriceBucket>) => void;
  /** True while the caller's own station/price filtering has no visible effect on what's currently
   * shown (e.g. halls/[slug].tsx's Grab 'N Go tab, whose sections are never station/price-filtered --
   * see that screen's own comment on why) -- hides Stations Here/Price entirely rather than showing
   * controls that would silently do nothing until the user switches to a different tab. #362 review
   * (non-blocking finding 3). */
  stationsPriceDisabled?: boolean;
  onClose: () => void;
}

/**
 * Dietary filter + macro/station/price refinement sheet (menu-filters-macros canvas). Same house
 * sheet shell as PlateSheet/HallInfoSheet/CafeSheet (transparent RN Modal, dimmed scrim, drag handle
 * via useDraggableSheet) -- deliberately not a new pattern. Presentational/controlled only: the
 * parent screen owns FoodPreferences (persisted) and the station/price selection (ephemeral, local
 * state, never saved) and passes both down.
 */
export function FilterSheet({
  visible,
  items,
  prefs,
  onChangePreferences,
  stationFilter,
  onChangeStationFilter,
  priceFilter,
  onChangePriceFilter,
  stationsPriceDisabled = false,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  // panelTravel must match styles.sheet's maxHeight (fs(680)) -- the default 400 undershoots this
  // sheet's real rendered height, leaving the sheet visibly un-closed/un-opened at rest (bug found
  // in on-device QA on PR #362).
  const { gesture, backdropStyle, panelStyle, modalVisible } = useDraggableSheet(visible, onClose, fs(680));

  const allergens = [...new Set(items.flatMap((i) => i.allergens))].sort();
  const dietTags = [...new Set(items.flatMap((i) => i.dietTags))].sort();
  const stations = distinctStations(items);
  const showPrice = !stationsPriceDisabled && items.some((i) => i.price !== undefined);
  const enabledMacroPresets = prefs.macroPresets ?? [];

  function toggleStation(station: string) {
    const next = new Set(stationFilter);
    if (next.has(station)) next.delete(station);
    else next.add(station);
    onChangeStationFilter(next);
  }

  function togglePrice(bucket: PriceBucket) {
    const next = new Set(priceFilter);
    if (next.has(bucket)) next.delete(bucket);
    else next.add(bucket);
    onChangePriceFilter(next);
  }

  function clearAll() {
    onChangePreferences({ ...prefs, allergensToAvoid: [], requiredDietTags: [], macroPresets: [] });
    onChangeStationFilter(new Set());
    onChangePriceFilter(new Set());
  }

  return (
    <Modal visible={modalVisible} transparent animationType="none" onRequestClose={onClose}>
      {/* RNGH's own documented caveat: a root-level GestureHandlerRootView (mobile/src/app/_layout.tsx)
      doesn't reliably propagate into a Modal's separate native host/window, so each sheet nests its
      own here -- same as every other house sheet. */}
      <GestureHandlerRootView style={styles.backdrop}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View style={[styles.sheet, panelStyle, { paddingBottom: spacing(3) + insets.bottom }]}>
          <GestureDetector gesture={gesture}>
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>
          </GestureDetector>

          <Text style={styles.title}>Filters</Text>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Avoid Allergens</Text>
                <Text style={styles.sectionSubtext}>saved · every menu</Text>
              </View>
              {allergens.length === 0 ? (
                <Text style={styles.emptyHint}>No allergen data on this menu.</Text>
              ) : (
                <View style={styles.chipRow}>
                  {allergens.map((a) => {
                    const active = prefs.allergensToAvoid.includes(a);
                    return (
                      <Pressable
                        key={a}
                        style={[styles.excludeChip, active && styles.excludeChipActive]}
                        onPress={() => onChangePreferences(toggleAllergen(prefs, a))}
                        accessibilityRole="button"
                        accessibilityLabel={`Allergen ${a}`}
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.excludeChipText, active && styles.excludeChipTextActive]}>
                          {a}
                          {active ? " ×" : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Require Diet Tags</Text>
                <Text style={styles.sectionSubtext}>saved · every menu</Text>
              </View>
              {dietTags.length === 0 ? (
                <Text style={styles.emptyHint}>No diet-tag data on this menu.</Text>
              ) : (
                <View style={styles.chipRow}>
                  {dietTags.map((t) => {
                    const active = prefs.requiredDietTags.includes(t);
                    return (
                      <Pressable
                        key={t}
                        style={[styles.excludeChip, active && styles.dietChipActive]}
                        onPress={() => onChangePreferences(toggleDietTag(prefs, t))}
                        accessibilityRole="button"
                        accessibilityLabel={`Diet tag ${t}`}
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.excludeChipText, active && styles.dietChipTextActive]}>
                          {t}
                          {active ? " ×" : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Macros</Text>
                <Text style={styles.sectionSubtext}>badges menu items, never hides them</Text>
              </View>
              <View style={styles.chipRow}>
                {ALL_MACRO_PRESETS.map((preset) => {
                  const active = enabledMacroPresets.includes(preset);
                  return (
                    <Pressable
                      key={preset}
                      style={[styles.toggleChip, active && styles.toggleChipActive]}
                      onPress={() => onChangePreferences(toggleMacroPreset(prefs, preset))}
                      accessibilityRole="button"
                      accessibilityLabel={`Macro ${MACRO_PRESET_LABELS[preset]}`}
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.toggleChipText, active && styles.toggleChipTextActive]}>
                        {active ? "✓ " : ""}
                        {MACRO_PRESET_LABELS[preset]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {!stationsPriceDisabled && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Stations Here</Text>
                  <Text style={styles.sectionSubtext}>this menu only</Text>
                </View>
                <View style={styles.chipRow}>
                  {stations.map((station) => {
                    const active = stationFilter.has(station);
                    return (
                      <Pressable
                        key={station}
                        style={[styles.toggleChip, active && styles.toggleChipActive]}
                        onPress={() => toggleStation(station)}
                        accessibilityRole="button"
                        accessibilityLabel={`Station ${station}`}
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.toggleChipText, active && styles.toggleChipTextActive]}>
                          {active ? "✓ " : ""}
                          {station}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {showPrice && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Price</Text>
                  <Text style={styles.sectionSubtext}>this menu only</Text>
                </View>
                <View style={styles.chipRow}>
                  {PRICE_BUCKETS.map((bucket) => {
                    const active = priceFilter.has(bucket);
                    return (
                      <Pressable
                        key={bucket}
                        style={[styles.toggleChip, active && styles.toggleChipActive]}
                        onPress={() => togglePrice(bucket)}
                        accessibilityRole="button"
                        accessibilityLabel={`Price ${PRICE_BUCKET_LABELS[bucket]}`}
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.toggleChipText, active && styles.toggleChipTextActive]}>
                          {active ? "✓ " : ""}
                          {PRICE_BUCKET_LABELS[bucket]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.footerGhost} onPress={clearAll} accessibilityRole="button" accessibilityLabel="Clear all filters">
              <Text style={styles.footerGhostText}>CLEAR ALL</Text>
            </Pressable>
            <Pressable style={styles.footerPrimary} onPress={onClose} accessibilityRole="button" accessibilityLabel="Done">
              <Text style={styles.footerPrimaryText}>DONE</Text>
            </Pressable>
          </View>
        </Animated.View>
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
    maxHeight: fs(680),
  },
  handleRow: { alignItems: "center", paddingVertical: spacing(5), marginBottom: spacing(1) },
  handle: { width: fs(40), height: 4, borderRadius: radii.pill, backgroundColor: withOpacity(colors.ink900, 20) },
  title: { fontFamily: fonts.display700, fontSize: fs(20), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900, marginBottom: spacing(2) },
  scroll: { flexGrow: 0 },

  section: { marginBottom: spacing(5) },
  sectionHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: spacing(2) },
  sectionTitle: { fontFamily: fonts.display600, fontSize: fs(13), letterSpacing: 0.5, textTransform: "uppercase", color: colors.maroon900 },
  sectionSubtext: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.ink900, 50) },
  emptyHint: { fontFamily: fonts.body400, fontSize: fs(13), color: withOpacity(colors.ink900, 55) },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2) },

  // Exclusion chips (allergens/diet tags): an "×"-to-remove pill, maroon outline -- these hide dishes.
  excludeChip: { paddingVertical: spacing(1.5), paddingHorizontal: spacing(3), borderRadius: 999, borderWidth: 1, borderColor: colors.maroon600 },
  excludeChipActive: { backgroundColor: colors.maroon600 },
  excludeChipText: { color: colors.maroon600, fontFamily: fonts.body600, fontSize: fs(13) },
  excludeChipTextActive: { color: colors.paper50 },
  // Diet-tag chips are exclusion-shaped ("×" pill) like excludeChip above, but gold when active --
  // approved design distinguishes them from Avoid Allergens' maroon fill (maroon900 text for contrast
  // against gold500, same pairing toggleChipTextActive already uses against a gold-tinted background).
  dietChipActive: { backgroundColor: colors.gold500 },
  dietChipTextActive: { color: colors.maroon900 },

  // Toggle chips (macros/stations/price): a checkmark-style toggle, gold outline -- these never hide
  // anything on their own (macros badge only; stations/price filter the visible list but don't imply
  // exclusion the way an allergen chip does), visually distinct from the excludeChip pair above.
  toggleChip: { paddingVertical: spacing(1.5), paddingHorizontal: spacing(3), borderRadius: radii.md, borderWidth: 1, borderColor: withOpacity(colors.gold500, 70) },
  toggleChipActive: { backgroundColor: withOpacity(colors.gold500, 25), borderColor: colors.gold500 },
  toggleChipText: { color: colors.ink900, fontFamily: fonts.body600, fontSize: fs(13) },
  toggleChipTextActive: { color: colors.maroon900 },

  footer: { flexDirection: "row", gap: spacing(3), paddingTop: spacing(3), borderTopWidth: 1, borderColor: withOpacity(colors.ink900, 12) },
  footerGhost: { flex: 1, height: fs(46), borderRadius: radii.md, borderWidth: 1, borderColor: withOpacity(colors.maroon600, 45), alignItems: "center", justifyContent: "center" },
  footerGhostText: { fontFamily: fonts.display600, fontSize: fs(13), letterSpacing: 1, color: colors.maroon600 },
  footerPrimary: { flex: 1, height: fs(46), borderRadius: radii.md, backgroundColor: colors.maroon600, alignItems: "center", justifyContent: "center" },
  footerPrimaryText: { fontFamily: fonts.display600, fontSize: fs(13), letterSpacing: 1, color: colors.paper50 },
});
