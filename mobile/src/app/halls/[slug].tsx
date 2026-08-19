import {
  DINING_HALLS,
  fetchMenu,
  favoriteKey,
  menuItemMatchesPreferences,
  type Favorite,
  type FoodPreferences,
  type LogEntry,
  type MealPeriod,
  type MenuItem,
} from "@udine/shared";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, EmptyState } from "../../components/ui";
import { colors, fonts, spacing, withOpacity } from "../../lib/theme";
import { SqliteFavoritesStorage } from "../../lib/favoritesStorage";
import { getPreferences } from "../../lib/preferences";
import { SqliteLogStorage } from "../../lib/sqliteStorage";

const MEAL_PERIODS: MealPeriod[] = ["breakfast", "lunch", "dinner"];
const storage = new SqliteLogStorage();
const favoritesStorage = new SqliteFavoritesStorage();

export default function HallMenuScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const hall = DINING_HALLS.find((h) => h.slug === slug);
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [servings, setServings] = useState("1");
  const [logged, setLogged] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<FoodPreferences>({ allergensToAvoid: [], requiredDietTags: [] });
  const [favoriteDishKeys, setFavoriteDishKeys] = useState<Set<string>>(new Set());

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

  async function logSelected() {
    if (!selected) return;
    const count = Number.parseFloat(servings) || 1;
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      loggedAt: new Date().toISOString(),
      source: { type: "umass-menu", dishName: selected.dishName, hallTid: selected.hallTid },
      servings: count,
      nutrition: selected.nutrition,
    };
    await storage.addEntry(entry);
    setLogged(`Logged ${selected.dishName}`);
    setSelected(null);
    setServings("1");
  }

  return (
    <View style={styles.container}>
      {sections.length === 0 ? (
        <EmptyState title="No matching dishes" message={`No menu matches your filters at ${hall.name} today.`} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${item.mealPeriod}-${item.dishName}-${index}`}
          renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable style={styles.rowMain} onPress={() => setSelected(item)}>
                <Text style={styles.rowText}>{item.dishName}</Text>
                <Text style={styles.rowCalories}>{item.nutrition.calories} cal</Text>
              </Pressable>
              <Pressable onPress={() => toggleDishFavorite(item.dishName)} hitSlop={8}>
                <Text style={[styles.star, favoriteDishKeys.has(favoriteKey({ type: "dish", dishName: item.dishName })) && styles.starActive]}>
                  {favoriteDishKeys.has(favoriteKey({ type: "dish", dishName: item.dishName })) ? "★" : "☆"}
                </Text>
              </Pressable>
            </View>
          )}
        />
      )}
      {logged && (
        <View style={styles.loggedBanner}>
          <Text style={styles.loggedBannerText}>{logged}</Text>
        </View>
      )}
      {selected && (
        <View style={styles.logBar}>
          <Text style={styles.logBarTitle}>{selected.dishName}</Text>
          <TextInput style={styles.servingsInput} keyboardType="numeric" value={servings} onChangeText={setServings} />
          <Button variant="primary" size="sm" onPress={logSelected}>
            Log
          </Button>
          <Button variant="ghost" size="sm" onPress={() => setSelected(null)}>
            Cancel
          </Button>
        </View>
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
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: withOpacity(colors.ink900, 15), backgroundColor: colors.paper50 },
  rowMain: { flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing(3) },
  rowText: { fontSize: 15, flex: 1, fontFamily: fonts.body, color: colors.ink900 },
  rowCalories: { fontSize: 13, fontFamily: fonts.mono, color: withOpacity(colors.ink900, 60) },
  star: { fontSize: 20, color: withOpacity(colors.ink900, 30), paddingHorizontal: spacing(3) },
  starActive: { color: colors.gold500 },
  loggedBanner: { backgroundColor: colors.maroon900, padding: spacing(2) },
  loggedBannerText: { color: colors.paper50, textAlign: "center", fontFamily: fonts.body, fontSize: 13 },
  logBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing(3),
    gap: spacing(2),
    borderTopWidth: 1,
    borderColor: withOpacity(colors.ink900, 15),
    backgroundColor: colors.paper50,
  },
  logBarTitle: { flex: 1, fontFamily: fonts.body, fontWeight: "600", color: colors.ink900 },
  servingsInput: {
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 25),
    borderRadius: 2,
    padding: spacing(1.5),
    width: 50,
    textAlign: "center",
    fontFamily: fonts.mono,
    color: colors.ink900,
  },
});
