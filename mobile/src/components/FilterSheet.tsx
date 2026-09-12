import { normalizeStationName, sortStationNames, type FoodPreferences, type MacroPreset, type MenuItem } from "@udine/shared";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { toggleAllergen, toggleDietTag, toggleMacroPreset } from "../lib/preferences";
import { useDraggableSheet } from "../lib/sheetAnimation";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

export type PriceBucket = "under-5" | "5-10" | "10-plus";

export const ALL_MACRO_PRESETS: MacroPreset[] = ["high-protein", "high-fiber", "low-sodium", "under-300-cal", "low-fat"];

export const MACRO_PRESET_LABELS: Record<MacroPreset, string> = {
  "high-protein": "High Protein",
  "low-sodium": "Low Sodium",
  "under-300-cal": "Under 300 Cal",
  "low-fat": "Low Fat",
  "high-fiber": "High Fiber",
};

// FilterSheet.dc.html:75-99: each Macros chip carries its own icon, distinct per preset, unlike
// the plain text Stations/Price chips -- active is a maroon900 glyph on a maroon900@14% circle,
// inactive is an ink900@60% glyph on an ink900@6% circle.
const MACRO_CHIP_ACTIVE_CIRCLE_FILL = withOpacity(colors.maroon900, 14);
const MACRO_CHIP_INACTIVE_CIRCLE_FILL = withOpacity(colors.ink900, 6);
const MACRO_CHIP_INACTIVE_GLYPH_COLOR = withOpacity(colors.ink900, 60);

function MacroChipGlyph({ preset, color }: { preset: MacroPreset; color: string }) {
  switch (preset) {
    case "high-protein":
      return (
        <>
          <Rect x={4.5} y={9} width={2.4} height={4} rx={0.8} fill={color} />
          <Rect x={13.1} y={9} width={2.4} height={4} rx={0.8} fill={color} />
          <Rect x={6.5} y={9.5} width={7} height={3} rx={1} fill={color} />
        </>
      );
    case "high-fiber":
      return (
        <>
          <Path d="M10 4.5c-2.6 3-4 5.2-4 7a4 4 0 0 0 8 0c0-1.8-1.4-4-4-7z" fill="none" stroke={color} strokeWidth={1.3} />
          <Path d="M10 8v6" stroke={color} strokeWidth={1.1} strokeLinecap="round" />
        </>
      );
    case "low-sodium":
      return <Path d="M10 4l4.5 2.6v5.2L10 14.5l-4.5-2.7V6.6z" fill="none" stroke={color} strokeWidth={1.2} />;
    case "under-300-cal":
      return <Path d="M10 4.5c-2.3 2.7-3.6 4.7-3.6 6.3a3.6 3.6 0 0 0 7.2 0c0-1.6-1.3-3.6-3.6-6.3z" fill="none" stroke={color} strokeWidth={1.2} />;
    case "low-fat":
      return (
        <>
          <Circle cx={10} cy={10.5} r={4} fill="none" stroke={color} strokeWidth={1.2} />
          <Path d="M10 5v1.6" stroke={color} strokeWidth={1.2} strokeLinecap="round" />
        </>
      );
    default:
      preset satisfies never;
      return null;
  }
}

function MacroChipIcon({ preset, active }: { preset: MacroPreset; active: boolean }) {
  const color = active ? colors.maroon900 : MACRO_CHIP_INACTIVE_GLYPH_COLOR;
  return (
    <Svg width={16} height={16} viewBox="0 0 20 20" accessible={false}>
      <Circle cx={10} cy={10} r={10} fill={active ? MACRO_CHIP_ACTIVE_CIRCLE_FILL : MACRO_CHIP_INACTIVE_CIRCLE_FILL} />
      <MacroChipGlyph preset={preset} color={color} />
    </Svg>
  );
}

// FilterSheet.dc.html:76: active Macros chips end in a drawn checkmark, not a "✓" character.
function CheckGlyph() {
  return (
    <Svg width={12} height={12} viewBox="0 0 14 14" accessible={false}>
      <Path d="M3 7.5l2.6 2.6L11 4.5" stroke={colors.maroon900} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

const PRICE_BUCKETS: PriceBucket[] = ["under-5", "5-10", "10-plus"];
const PRICE_BUCKET_LABELS: Record<PriceBucket, string> = {
  "under-5": "Under $5",
  "5-10": "$5–$10",
  "10-plus": "$10+",
};

/** Which price bucket a feed price string ("$3.00") falls into; null if it doesn't parse. */
export function priceBucketFor(price: string): PriceBucket | null {
  const n = parseFloat(price.replace("$", ""));
  if (Number.isNaN(n)) return null;
  if (n < 5) return "under-5";
  if (n <= 10) return "5-10";
  return "10-plus";
}

/** Distinct station names in `items`, normalized (the feed publishes inconsistent whitespace on
 * some category names, e.g. "Grab n'Go Hot ") and ordered by sortStationNames -- the same fixed
 * food-journey order the menu's own section list uses, not a plain alphabetical sort, so this
 * checklist reads in the same order the stations actually appear on the menu. */
export function distinctStations(items: MenuItem[]): string[] {
  return sortStationNames([...new Set(items.map((i) => normalizeStationName(i.category)))]);
}

/** True if `item` passes the station/price filters (an empty filter set means no restriction).
 * Callers apply this themselves before hallMenuSections.ts, which only filters allergens/diet
 * tags -- station/price never do. */
export function itemMatchesStationAndPriceFilter(item: MenuItem, stationFilter: ReadonlySet<string>, priceFilter: ReadonlySet<PriceBucket>): boolean {
  if (stationFilter.size > 0 && !stationFilter.has(normalizeStationName(item.category))) return false;
  if (priceFilter.size > 0) {
    const bucket = item.price ? priceBucketFor(item.price) : null;
    if (bucket === null || !priceFilter.has(bucket)) return false;
  }
  return true;
}

interface Props {
  visible: boolean;
  /** The screen's full, unfiltered item list -- every section's options are derived from this,
   * not an already station/price-filtered list, so picking one filter doesn't hide the others' options. */
  items: MenuItem[];
  prefs: FoodPreferences;
  onChangePreferences: (next: FoodPreferences) => void;
  /** Ephemeral, parent-owned, never persisted. */
  stationFilter: ReadonlySet<string>;
  onChangeStationFilter: (next: Set<string>) => void;
  priceFilter: ReadonlySet<PriceBucket>;
  onChangePriceFilter: (next: Set<PriceBucket>) => void;
  /** True when the caller's station/price filtering has no effect on what's shown (e.g. the
   * Grab 'N Go tab) -- hides Stations Here/Price entirely instead of showing controls that do nothing. */
  stationsPriceDisabled?: boolean;
  /** Count of items the screen's current filters hide, for the "N items hidden" counter. */
  hiddenCount: number;
  onClose: () => void;
}

/** Dietary filter + macro/station/price refinement sheet. Same house sheet shell as
 * PlateSheet/HallInfoSheet/CafeSheet. Presentational/controlled only: the parent screen owns
 * FoodPreferences and the ephemeral station/price selection and passes both down. */
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
  hiddenCount,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  // panelTravel must match styles.sheet's maxHeight, or the sheet visibly settles un-closed/un-opened at rest.
  const { gesture, backdropStyle, panelStyle, modalVisible } = useDraggableSheet(visible, onClose, fs(640));

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
      {/* A root-level GestureHandlerRootView doesn't propagate into a Modal's own native window,
      so each sheet nests its own -- same as every other house sheet. */}
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

          <View style={styles.titleRow}>
            <Text style={styles.title}>Filters</Text>
            {hiddenCount > 0 && (
              <Text style={styles.hiddenCountText}>
                {hiddenCount} {hiddenCount === 1 ? "item" : "items"} hidden
              </Text>
            )}
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Avoid Allergens</Text>
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
              </View>
              <View style={styles.chipRow}>
                {ALL_MACRO_PRESETS.map((preset) => {
                  const active = enabledMacroPresets.includes(preset);
                  return (
                    <Pressable
                      key={preset}
                      style={[styles.toggleChip, styles.macroChip, active && styles.toggleChipActive]}
                      onPress={() => onChangePreferences(toggleMacroPreset(prefs, preset))}
                      accessibilityRole="button"
                      accessibilityLabel={`Macro ${MACRO_PRESET_LABELS[preset]}`}
                      accessibilityState={{ selected: active }}
                    >
                      <MacroChipIcon preset={preset} active={active} />
                      <Text style={[styles.toggleChipText, active && styles.toggleChipTextActive]}>{MACRO_PRESET_LABELS[preset]}</Text>
                      {active && <CheckGlyph />}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {!stationsPriceDisabled && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Stations Here</Text>
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
    maxHeight: fs(640),
    shadowColor: colors.ink900,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  handleRow: { alignItems: "center", paddingVertical: spacing(5), marginBottom: spacing(1) },
  handle: { width: fs(40), height: 4, borderRadius: radii.pill, backgroundColor: withOpacity(colors.ink900, 20) },
  titleRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: spacing(2) },
  title: { fontFamily: fonts.display700, fontSize: fs(20), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },
  hiddenCountText: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.ink900, 55) },
  scroll: { flexGrow: 0 },

  section: { marginBottom: spacing(5) },
  sectionHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: spacing(2) },
  sectionTitle: { fontFamily: fonts.display600, fontSize: fs(12), letterSpacing: 1.2, textTransform: "uppercase", color: colors.maroon900 },
  emptyHint: { fontFamily: fonts.body400, fontSize: fs(13), color: withOpacity(colors.ink900, 55) },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2) },

  // Exclusion chips (allergens/diet tags): an "×"-to-remove pill, ink-tinted outline when inactive.
  excludeChip: { paddingVertical: spacing(2), paddingHorizontal: spacing(3.5), borderRadius: radii.pill, borderWidth: 1, borderColor: withOpacity(colors.ink900, 25) },
  excludeChipActive: { backgroundColor: colors.maroon600, borderColor: "transparent" },
  excludeChipText: { color: colors.maroon900, fontFamily: fonts.body400, fontSize: fs(13) },
  excludeChipTextActive: { color: colors.paper50, fontFamily: fonts.body600 },
  // Diet-tag chips are exclusion-shaped like excludeChip above, but gold when active.
  dietChipActive: { backgroundColor: colors.gold500, borderColor: "transparent" },
  dietChipTextActive: { color: colors.maroon900, fontFamily: fonts.body600 },

  // Toggle chips (macros/stations/price) never hide anything on their own, unlike the exclude pair above.
  toggleChip: { paddingVertical: spacing(2), paddingHorizontal: spacing(3.5), borderRadius: radii.pill, borderWidth: 1, borderColor: withOpacity(colors.ink900, 25) },
  toggleChipActive: { backgroundColor: colors.gold500, borderColor: colors.gold500 },
  toggleChipText: { color: colors.maroon900, fontFamily: fonts.body600, fontSize: fs(13) },
  toggleChipTextActive: { color: colors.maroon900 },
  macroChip: { flexDirection: "row", alignItems: "center", gap: spacing(1.5), paddingLeft: spacing(2) },

  footer: { flexDirection: "row", gap: spacing(3), paddingTop: spacing(3), borderTopWidth: 1, borderColor: withOpacity(colors.ink900, 12) },
  footerGhost: { flex: 1, height: fs(46), borderRadius: radii.md, borderWidth: 1, borderColor: withOpacity(colors.ink900, 20), alignItems: "center", justifyContent: "center" },
  footerGhostText: { fontFamily: fonts.display600, fontSize: fs(13), letterSpacing: 1, color: withOpacity(colors.ink900, 65) },
  footerPrimary: { flex: 1, height: fs(46), borderRadius: radii.md, backgroundColor: colors.maroon900, alignItems: "center", justifyContent: "center" },
  footerPrimaryText: { fontFamily: fonts.display600, fontSize: fs(13), letterSpacing: 1, color: colors.paper50 },
});
