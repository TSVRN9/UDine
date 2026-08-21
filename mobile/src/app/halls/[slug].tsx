import {
  computeDailyTotals,
  DINING_HALLS,
  fetchDiningHours,
  favoriteKey,
  menuItemMatchesPreferences,
  type DiningHoursFeed,
  type Favorite,
  type FoodPreferences,
  type MealPeriod,
  type MenuItem,
  type OffSearchResult,
} from "@udine/shared";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState, SectionHeader } from "../../components/ui";
import { NutritionLabel } from "../../components/NutritionLabel";
import { PlateBar } from "../../components/PlateBar";
import { PlateSheet } from "../../components/PlateSheet";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../../lib/theme";
import { hallHeaderSubtitle } from "../../lib/homeHero";
import { SqliteFavoritesStorage } from "../../lib/favoritesStorage";
import { fetchMenuAndRecordSeen } from "../../lib/menuFetchWithSeenTracking";
import {
  addOrIncrement,
  listBottomPadding,
  menuItemToPlateEntry,
  offResultToPlateEntry,
  plateKeyFor,
  stepCount,
  toLogEntries,
  totalItemCount,
  type PlateEntry,
} from "../../lib/plate";
import { getPreferences } from "../../lib/preferences";
import { nowLocalIso } from "../../lib/date";
import { SqliteLogStorage } from "../../lib/sqliteStorage";

const MEAL_PERIODS: MealPeriod[] = ["breakfast", "lunch", "dinner"];
const storage = new SqliteLogStorage();
const favoritesStorage = new SqliteFavoritesStorage();

// #91 rebuild: dish rows now feed an in-memory "plate" (steppers) instead of a single-selection log
// bar, plus a full nutrition-label screen. Both the plate's expanded sheet and the label are RN
// <Modal>s rendered from this screen, not routed Stack.Screens — MenuItem doesn't need to survive a
// round-trip through router search params (Expo Router params are strings only), and neither needs
// a back-stack entry of its own. Register in _layout.tsx only if that changes.

/** Filled maroon pill stepper — the canvas's in-plate control on a dish row. */
function RowStepper({ count, dishName, onStep }: { count: number; dishName: string; onStep: (delta: number) => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepperButton} onPress={() => onStep(-1)} accessibilityRole="button" accessibilityLabel={`Remove one ${dishName}`}>
        <Text style={styles.stepperButtonText}>−</Text>
      </Pressable>
      <Text style={styles.stepperCount}>{count}</Text>
      <Pressable style={styles.stepperButton} onPress={() => onStep(1)} accessibilityRole="button" accessibilityLabel={`Add one ${dishName}`}>
        <Text style={styles.stepperButtonText}>+</Text>
      </Pressable>
    </View>
  );
}

export default function HallMenuScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const hall = DINING_HALLS.find((h) => h.slug === slug);
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<FoodPreferences>({ allergensToAvoid: [], requiredDietTags: [] });
  const [favoriteDishKeys, setFavoriteDishKeys] = useState<Set<string>>(new Set());
  const [hoursFeed, setHoursFeed] = useState<DiningHoursFeed | null>(null);

  const [plate, setPlate] = useState<PlateEntry[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [labelItem, setLabelItem] = useState<MenuItem | null>(null);
  const [barHeight, setBarHeight] = useState(0);
  const [logged, setLogged] = useState<string | null>(null);
  const [bannerHeight, setBannerHeight] = useState(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!hall) return;
    fetchMenuAndRecordSeen(hall.tid, new Date())
      .then(setItems)
      .catch((e) => setError(String(e)));
    // Header subtitle only — a failure here just leaves the subtitle blank, never blocks the menu.
    fetchDiningHours()
      .then(setHoursFeed)
      .catch(() => {});
  }, [hall]);

  useFocusEffect(
    useCallback(() => {
      getPreferences().then(setPrefs);
      favoritesStorage.getFavorites().then((favs) => {
        setFavoriteDishKeys(new Set(favs.filter((f) => f.type === "dish").map(favoriteKey)));
      });
    }, []),
  );

  // Device-pass finding: the logged banner never dismissed on its own, permanently covering the
  // last menu row until the plate was repopulated. Auto-dismiss a few seconds after it appears.
  useEffect(() => {
    if (!logged) return;
    const timer = setTimeout(() => setLogged(null), 4000);
    return () => clearTimeout(timer);
  }, [logged]);

  const sections = useMemo(() => {
    if (!items) return [];
    const filtered = items.filter((i) => menuItemMatchesPreferences(i, prefs));
    return MEAL_PERIODS.map((period) => ({
      title: period,
      data: filtered.filter((i) => i.mealPeriod === period),
    })).filter((s) => s.data.length > 0);
  }, [items, prefs]);

  const totals = useMemo(() => computeDailyTotals("plate", toLogEntries(plate, "1970-01-01T00:00:00.000Z")), [plate]);

  if (!hall) return <Text style={styles.error}>Unknown dining hall</Text>;

  const hallHours = hoursFeed?.halls.find((h) => h.hallTid === hall.tid);
  const subtitle = hallHours ? hallHeaderSubtitle(hallHours, new Date()) : "";

  async function toggleDishFavorite(dishName: string) {
    const favorite: Favorite = { type: "dish", dishName };
    const key = favoriteKey(favorite);
    if (favoriteDishKeys.has(key)) {
      await favoritesStorage.removeFavorite(favorite);
    } else {
      await favoritesStorage.addFavorite(favorite);
    }
    const favs = await favoritesStorage.getFavorites();
    setFavoriteDishKeys(new Set(favs.filter((f) => f.type === "dish").map(favoriteKey)));
  }

  function addToPlate(item: MenuItem, count = 1) {
    setPlate((p) => {
      let next = p;
      for (let i = 0; i < count; i++) next = addOrIncrement(next, menuItemToPlateEntry(item));
      return next;
    });
  }

  function stepPlateItem(item: MenuItem, delta: number) {
    setPlate((p) => stepCount(p, plateKeyFor({ type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid }), delta));
  }

  function addOffResult(result: OffSearchResult) {
    setPlate((p) => addOrIncrement(p, offResultToPlateEntry(result)));
  }

  async function logPlate() {
    // Local-date-prefixed, not `.toISOString()` (UTC) -- see nowLocalIso's own comment (issue #111:
    // evening logs were filing under tomorrow's UTC date and vanishing from Today).
    const entries = toLogEntries(plate, nowLocalIso());
    try {
      for (const entry of entries) {
        await storage.addEntry(entry);
      }
    } catch (e) {
      // ponytail: no transaction wrapping this loop, so a failure partway through leaves
      // whatever already succeeded committed, and the plate stays put (not cleared) so the user
      // doesn't lose their selection -- but retrying re-logs everything with fresh ids
      // (toLogEntries mints new random ids each call), so anything that already committed
      // becomes a duplicate row rather than being replaced. Acceptable for a UI feature where
      // each addEntry is one single-row insert unlikely to fail independently; upgrade to one
      // transactional bulk insert on SqliteLogStorage if this shows up in practice.
      setLogged(`Couldn't log everything: ${String(e)}`);
      return;
    }
    const count = totalItemCount(plate);
    setPlate([]);
    setSheetOpen(false);
    setLogged(`Logged ${count} ${count === 1 ? "item" : "items"}`);
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing(4.5) }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{hall.name}</Text>
          {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>

      {error ? (
        <Text style={styles.error}>Failed to load menu: {error}</Text>
      ) : !items ? (
        <ActivityIndicator style={styles.loading} color={colors.maroon600} />
      ) : sections.length === 0 ? (
        <EmptyState title="No matching dishes" message={`No menu matches your filters at ${hall.name} today.`} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${item.mealPeriod}-${item.dishName}-${index}`}
          contentContainerStyle={{ paddingBottom: listBottomPadding(barHeight, plate.length > 0) + (logged ? bannerHeight : 0) }}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeaderWrap}>
              <SectionHeader title={section.title} />
            </View>
          )}
          renderItem={({ item }) => {
            const plateEntry = plate.find((p) => p.key === plateKeyFor({ type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid }));
            const isFavorite = favoriteDishKeys.has(favoriteKey({ type: "dish", dishName: item.dishName }));
            return (
              <View style={[styles.row, plateEntry && styles.rowInPlate]}>
                <Pressable onPress={() => toggleDishFavorite(item.dishName)} hitSlop={8}>
                  <Text style={[styles.star, isFavorite && styles.starActive]}>{isFavorite ? "★" : "☆"}</Text>
                </Pressable>
                <View style={styles.rowMain}>
                  <Text style={styles.rowText}>{item.dishName}</Text>
                  <Text style={styles.rowCalories}>
                    {item.nutrition.calories} cal · {Math.round(item.nutrition.proteinG)}g protein
                  </Text>
                </View>
                <Pressable
                  style={styles.infoButton}
                  onPress={() => setLabelItem(item)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Nutrition facts for ${item.dishName}`}
                >
                  <Text style={styles.infoIcon}>ⓘ</Text>
                </Pressable>
                {plateEntry ? (
                  <RowStepper count={plateEntry.count} dishName={item.dishName} onStep={(delta) => stepPlateItem(item, delta)} />
                ) : (
                  <Pressable style={styles.addButton} onPress={() => addToPlate(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Add ${item.dishName} to plate`}>
                    <Text style={styles.addButtonText}>+</Text>
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}
      {logged && (
        // Same occlusion-bug class as the list's own bottom padding above (PR #78/#84): this banner
        // is the one surface a LOG failure actually shows on (the plate is deliberately retained, not
        // cleared, so the bar stays mounted right where an in-flow bottom banner would otherwise sit,
        // opaque and on top of it). Anchored clear of the bar's measured height via the same
        // listBottomPadding reuse -- 0 when there's no bar, right above it when there is. Device-pass
        // finding: also pads for the bottom safe-area inset itself (else its own text gets clipped by
        // gesture nav when there's no bar to already clear that space), and reports its own measured
        // height via onLayout so the list's paddingBottom above can add it in while it's showing.
        <View
          style={[styles.loggedBanner, { position: "absolute", left: 0, right: 0, bottom: listBottomPadding(barHeight, plate.length > 0), paddingBottom: spacing(2) + insets.bottom }]}
          onLayout={(e) => setBannerHeight(e.nativeEvent.layout.height)}
        >
          <Text style={styles.loggedBannerText}>{logged}</Text>
        </View>
      )}
      {plate.length > 0 && (
        <PlateBar itemCount={totalItemCount(plate)} totals={totals} onPress={() => setSheetOpen(true)} onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)} />
      )}
      <PlateSheet
        visible={sheetOpen}
        plate={plate}
        totals={totals}
        contextLabel={hall.name}
        onStep={(key, delta) => setPlate((p) => stepCount(p, key, delta))}
        onAddOffResult={addOffResult}
        onLog={logPlate}
        onClose={() => setSheetOpen(false)}
      />
      {labelItem && (
        <NutritionLabel
          visible={!!labelItem}
          dishName={labelItem.dishName}
          // The feed's category already carries the meal period ("Breakfast Entrees") — don't
          // prefix mealPeriod again.
          subtitle={`${hall.name} · ${labelItem.category}`}
          nutrition={labelItem.nutrition}
          allergens={labelItem.allergens}
          dietTags={labelItem.dietTags}
          onAddToPlate={(count) => {
            addToPlate(labelItem, count);
            setLabelItem(null);
          }}
          onClose={() => setLabelItem(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream100 },
  loading: { flex: 1, backgroundColor: colors.cream100 },
  error: { padding: spacing(4), color: "#b00020", fontFamily: fonts.body400 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(3),
  },
  backChevron: { fontFamily: fonts.body400, fontSize: fs(32), lineHeight: fs(34), color: colors.maroon900, marginTop: -4 },
  headerText: { flex: 1 },
  headerTitle: {
    fontFamily: fonts.display700,
    fontSize: fs(22),
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  headerSubtitle: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.ink900, 60) },

  sectionHeaderWrap: {
    paddingHorizontal: spacing(5),
    paddingTop: spacing(3),
    paddingBottom: spacing(2),
    backgroundColor: colors.cream100,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    marginHorizontal: spacing(5),
    marginBottom: spacing(2),
    backgroundColor: colors.paper50,
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 12),
    borderRadius: radii.md,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3),
  },
  rowInPlate: { borderColor: colors.gold500 },
  rowMain: { flex: 1, gap: 1 },
  rowText: { fontSize: fs(14), fontFamily: fonts.body600, color: colors.ink900 },
  rowCalories: { fontSize: fs(12), fontFamily: fonts.mono, color: withOpacity(colors.ink900, 60) },
  star: { fontSize: fs(20), color: withOpacity(colors.ink900, 30) },
  starActive: { color: colors.gold500 },
  infoButton: { width: fs(30), height: fs(44), alignItems: "center", justifyContent: "center" },
  infoIcon: { fontSize: fs(18), color: withOpacity(colors.ink900, 40) },

  addButton: {
    width: fs(44),
    height: fs(44),
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: withOpacity(colors.maroon600, 45),
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: { fontSize: fs(20), color: colors.maroon600, lineHeight: fs(22) },

  stepper: { flexDirection: "row", alignItems: "center", backgroundColor: colors.maroon600, borderRadius: radii.pill },
  stepperButton: { width: fs(34), height: fs(44), alignItems: "center", justifyContent: "center" },
  stepperButtonText: { fontSize: fs(18), color: colors.paper50 },
  stepperCount: { fontFamily: fonts.mono, fontSize: fs(14), fontWeight: "600", minWidth: 16, textAlign: "center", color: colors.paper50 },

  loggedBanner: { backgroundColor: colors.maroon900, padding: spacing(2) },
  loggedBannerText: { color: colors.paper50, textAlign: "center", fontFamily: fonts.body400, fontSize: fs(13) },
});
