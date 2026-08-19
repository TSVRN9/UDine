import {
  computeDailyTotals,
  DINING_HALLS,
  fetchMenu,
  favoriteKey,
  menuItemMatchesPreferences,
  type Favorite,
  type FoodPreferences,
  type MealPeriod,
  type MenuItem,
  type OffSearchResult,
} from "@udine/shared";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "../../components/ui";
import { NutritionLabel } from "../../components/NutritionLabel";
import { PlateBar } from "../../components/PlateBar";
import { PlateSheet } from "../../components/PlateSheet";
import { colors, fonts, spacing, withOpacity } from "../../lib/theme";
import { SqliteFavoritesStorage } from "../../lib/favoritesStorage";
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
import { SqliteLogStorage } from "../../lib/sqliteStorage";

const MEAL_PERIODS: MealPeriod[] = ["breakfast", "lunch", "dinner"];
const storage = new SqliteLogStorage();
const favoritesStorage = new SqliteFavoritesStorage();

// #91 rebuild: dish rows now feed an in-memory "plate" (steppers) instead of a single-selection log
// bar, plus a full nutrition-label screen. Both the plate's expanded sheet and the label are RN
// <Modal>s rendered from this screen, not routed Stack.Screens — MenuItem doesn't need to survive a
// round-trip through router search params (Expo Router params are strings only), and neither needs
// a back-stack entry of its own. Register in _layout.tsx only if that changes.

export default function HallMenuScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const hall = DINING_HALLS.find((h) => h.slug === slug);
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<FoodPreferences>({ allergensToAvoid: [], requiredDietTags: [] });
  const [favoriteDishKeys, setFavoriteDishKeys] = useState<Set<string>>(new Set());

  const [plate, setPlate] = useState<PlateEntry[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [labelItem, setLabelItem] = useState<MenuItem | null>(null);
  const [barHeight, setBarHeight] = useState(0);
  const [logged, setLogged] = useState<string | null>(null);

  useEffect(() => {
    if (!hall) return;
    fetchMenu(hall.tid, new Date())
      .then(setItems)
      .catch((e) => setError(String(e)));
  }, [hall]);

  useFocusEffect(
    useCallback(() => {
      getPreferences().then(setPrefs);
      favoritesStorage.getFavorites().then((favs) => {
        setFavoriteDishKeys(new Set(favs.filter((f) => f.type === "dish").map(favoriteKey)));
      });
    }, []),
  );

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
  if (error) return <Text style={styles.error}>Failed to load menu: {error}</Text>;
  if (!items) return <ActivityIndicator style={styles.loading} color={colors.maroon600} />;

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

  function addToPlate(item: MenuItem) {
    setPlate((p) => addOrIncrement(p, menuItemToPlateEntry(item)));
  }

  function stepPlateItem(item: MenuItem, delta: number) {
    setPlate((p) => stepCount(p, plateKeyFor({ type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid }), delta));
  }

  function addOffResult(result: OffSearchResult) {
    setPlate((p) => addOrIncrement(p, offResultToPlateEntry(result)));
  }

  async function logPlate() {
    const entries = toLogEntries(plate, new Date().toISOString());
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
      {sections.length === 0 ? (
        <EmptyState title="No matching dishes" message={`No menu matches your filters at ${hall.name} today.`} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${item.mealPeriod}-${item.dishName}-${index}`}
          contentContainerStyle={{ paddingBottom: listBottomPadding(barHeight, plate.length > 0) }}
          renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
          renderItem={({ item }) => {
            const plateEntry = plate.find((p) => p.key === plateKeyFor({ type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid }));
            const isFavorite = favoriteDishKeys.has(favoriteKey({ type: "dish", dishName: item.dishName }));
            return (
              <View style={styles.row}>
                <Pressable onPress={() => toggleDishFavorite(item.dishName)} hitSlop={8}>
                  <Text style={[styles.star, isFavorite && styles.starActive]}>{isFavorite ? "★" : "☆"}</Text>
                </Pressable>
                <View style={styles.rowMain}>
                  <Text style={styles.rowText}>{item.dishName}</Text>
                  <Text style={styles.rowCalories}>{item.nutrition.calories} cal</Text>
                </View>
                <Pressable onPress={() => setLabelItem(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Nutrition facts for ${item.dishName}`}>
                  <Text style={styles.infoIcon}>ⓘ</Text>
                </Pressable>
                {plateEntry ? (
                  <View style={styles.stepper}>
                    <Pressable style={styles.stepperButton} onPress={() => stepPlateItem(item, -1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove one ${item.dishName}`}>
                      <Text style={styles.stepperButtonText}>−</Text>
                    </Pressable>
                    <Text style={styles.stepperCount}>{plateEntry.count}</Text>
                    <Pressable style={styles.stepperButton} onPress={() => stepPlateItem(item, 1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Add one ${item.dishName}`}>
                      <Text style={styles.stepperButtonText}>+</Text>
                    </Pressable>
                  </View>
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
        <View style={styles.loggedBanner}>
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
        onStep={(key, delta) => setPlate((p) => stepCount(p, key, delta))}
        onAddOffResult={addOffResult}
        onLog={logPlate}
        onClose={() => setSheetOpen(false)}
      />
      {labelItem && (
        <NutritionLabel
          visible={!!labelItem}
          dishName={labelItem.dishName}
          nutrition={labelItem.nutrition}
          allergens={labelItem.allergens}
          dietTags={labelItem.dietTags}
          onClose={() => setLabelItem(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream100 },
  loading: { flex: 1, backgroundColor: colors.cream100 },
  error: { padding: spacing(4), color: "#b00020", fontFamily: fonts.body },
  sectionHeader: {
    fontFamily: fonts.display,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    backgroundColor: colors.cream100,
    color: colors.maroon900,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2),
  },
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: withOpacity(colors.ink900, 15), backgroundColor: colors.paper50, paddingVertical: spacing(2), paddingHorizontal: spacing(3), gap: spacing(2) },
  rowMain: { flex: 1 },
  rowText: { fontSize: 15, fontFamily: fonts.body, color: colors.ink900 },
  rowCalories: { fontSize: 13, fontFamily: fonts.mono, color: withOpacity(colors.ink900, 60) },
  star: { fontSize: 20, color: withOpacity(colors.ink900, 30) },
  starActive: { color: colors.gold500 },
  infoIcon: { fontSize: 18, color: withOpacity(colors.maroon600, 80) },
  addButton: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.maroon600, alignItems: "center", justifyContent: "center" },
  addButtonText: { fontSize: 18, fontWeight: "700", color: colors.maroon600, lineHeight: 20 },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing(1.5) },
  stepperButton: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.maroon600, alignItems: "center", justifyContent: "center" },
  stepperButtonText: { fontSize: 15, fontWeight: "700", color: colors.maroon600 },
  stepperCount: { fontFamily: fonts.mono, fontSize: 14, minWidth: 16, textAlign: "center", color: colors.ink900 },
  loggedBanner: { backgroundColor: colors.maroon900, padding: spacing(2) },
  loggedBannerText: { color: colors.paper50, textAlign: "center", fontFamily: fonts.body, fontSize: 13 },
});
