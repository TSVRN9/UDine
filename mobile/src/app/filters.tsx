import { DINING_HALLS, fetchMenu, type FoodPreferences } from "@udine/shared";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getPreferences, setPreferences } from "../lib/preferences";

export default function FiltersScreen() {
  const [allergens, setAllergens] = useState<string[] | null>(null);
  const [dietTags, setDietTags] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<FoodPreferences>({ allergensToAvoid: [], requiredDietTags: [] });

  useEffect(() => {
    getPreferences().then(setPrefs);
    Promise.all(DINING_HALLS.map((h) => fetchMenu(h.tid, new Date()))).then((menus) => {
      const items = menus.flat();
      setAllergens([...new Set(items.flatMap((i) => i.allergens))].sort());
      setDietTags([...new Set(items.flatMap((i) => i.dietTags))].sort());
    });
  }, []);

  function toggleAllergen(allergen: string) {
    const next = prefs.allergensToAvoid.includes(allergen)
      ? prefs.allergensToAvoid.filter((a) => a !== allergen)
      : [...prefs.allergensToAvoid, allergen];
    const updated = { ...prefs, allergensToAvoid: next };
    setPrefs(updated);
    setPreferences(updated);
  }

  function toggleDietTag(tag: string) {
    const next = prefs.requiredDietTags.includes(tag) ? prefs.requiredDietTags.filter((t) => t !== tag) : [...prefs.requiredDietTags, tag];
    const updated = { ...prefs, requiredDietTags: next };
    setPrefs(updated);
    setPreferences(updated);
  }

  if (!allergens) return <ActivityIndicator style={styles.container} />;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>Avoid allergens</Text>
      <View style={styles.chipRow}>
        {allergens.map((a) => (
          <Pressable key={a} style={[styles.chip, prefs.allergensToAvoid.includes(a) && styles.chipActive]} onPress={() => toggleAllergen(a)}>
            <Text style={[styles.chipText, prefs.allergensToAvoid.includes(a) && styles.chipTextActive]}>{a}</Text>
          </Pressable>
        ))}
        {allergens.length === 0 && <Text style={styles.empty}>No allergen data found in today's menus.</Text>}
      </View>

      <Text style={styles.sectionTitle}>Require diet tags</Text>
      <View style={styles.chipRow}>
        {dietTags.map((t) => (
          <Pressable key={t} style={[styles.chip, prefs.requiredDietTags.includes(t) && styles.chipActive]} onPress={() => toggleDietTag(t)}>
            <Text style={[styles.chipText, prefs.requiredDietTags.includes(t) && styles.chipTextActive]}>{t}</Text>
          </Pressable>
        ))}
        {dietTags.length === 0 && <Text style={styles.empty}>No diet-tag data found in today's menus.</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 12, marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: "#208AEF" },
  chipActive: { backgroundColor: "#208AEF" },
  chipText: { color: "#208AEF" },
  chipTextActive: { color: "white" },
  empty: { color: "#666" },
});
