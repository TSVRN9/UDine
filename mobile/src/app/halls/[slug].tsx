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
  if (!items) return <ActivityIndicator style={styles.container} />;

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
        <Text style={styles.empty}>No menu matches your filters at {hall.name} today.</Text>
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
                <Text style={styles.star}>{favoriteDishKeys.has(favoriteKey({ type: "dish", dishName: item.dishName })) ? "★" : "☆"}</Text>
              </Pressable>
            </View>
          )}
        />
      )}
      {logged && <Text style={styles.loggedBanner}>{logged}</Text>}
      {selected && (
        <View style={styles.logBar}>
          <Text style={styles.logBarTitle}>{selected.dishName}</Text>
          <TextInput style={styles.servingsInput} keyboardType="numeric" value={servings} onChangeText={setServings} />
          <Pressable style={styles.logButton} onPress={logSelected}>
            <Text style={styles.logButtonText}>Log</Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={() => setSelected(null)}>
            <Text>Cancel</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  error: { padding: 16, color: "red" },
  empty: { padding: 16 },
  sectionHeader: { fontSize: 16, fontWeight: "700", backgroundColor: "#eee", padding: 8, textTransform: "capitalize" },
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#ccc" },
  rowMain: { flex: 1, flexDirection: "row", justifyContent: "space-between", padding: 12 },
  rowText: { fontSize: 15, flex: 1 },
  rowCalories: { fontSize: 13, color: "#666" },
  star: { fontSize: 20, color: "#e0a800", paddingHorizontal: 12 },
  loggedBanner: { backgroundColor: "#d4edda", padding: 8, textAlign: "center" },
  logBar: { flexDirection: "row", alignItems: "center", padding: 12, gap: 8, borderTopWidth: 1, borderColor: "#ccc", backgroundColor: "#fafafa" },
  logBarTitle: { flex: 1, fontWeight: "600" },
  servingsInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 6, width: 50, textAlign: "center" },
  logButton: { backgroundColor: "#208AEF", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6 },
  logButtonText: { color: "white", fontWeight: "600" },
  cancelButton: { padding: 8 },
});
