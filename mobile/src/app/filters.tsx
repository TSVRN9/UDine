import { DINING_HALLS, fetchMenu, type FoodPreferences } from "@udine/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "../components/ui";
import { MenuErrorCard } from "../components/MenuErrorCard";
import { colors, fonts, spacing, withOpacity } from "../lib/theme";
import { getPreferences, setPreferences } from "../lib/preferences";

export default function FiltersScreen() {
  const [allergens, setAllergens] = useState<string[] | null>(null);
  const [dietTags, setDietTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<FoodPreferences>({ allergensToAvoid: [], requiredDietTags: [] });
  // #191 rework: same generation-counter guard as halls/[slug].tsx's fetch effect -- a stale
  // response from an earlier loadMenus() call (e.g. a slow initial fetch outlived by a retry)
  // must not clobber a later one's result/error. Incremented per loadMenus() call and on unmount;
  // a settled promise only applies its result if the generation it started with still matches.
  const generation = useRef(0);

  // #191: was a bare Promise.all with no .catch -- any hall fetch rejecting left `allergens` null
  // forever, spinning the ActivityIndicator indefinitely. Reuses #181's MenuErrorCard (no saved-copy
  // concept here, so savedCopyTime is always null and its link never renders).
  const loadMenus = useCallback(() => {
    const gen = ++generation.current;
    setError(null);
    Promise.all(DINING_HALLS.map((h) => fetchMenu(h.tid, new Date())))
      .then((menus) => {
        if (gen !== generation.current) return;
        const items = menus.flat();
        setAllergens([...new Set(items.flatMap((i) => i.allergens))].sort());
        setDietTags([...new Set(items.flatMap((i) => i.dietTags))].sort());
      })
      .catch((e) => {
        if (gen !== generation.current) return;
        setError(String(e));
      });
  }, []);

  useEffect(() => {
    getPreferences().then(setPrefs);
    loadMenus();
    return () => {
      generation.current++;
    };
  }, [loadMenus]);

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

  if (error) {
    return (
      <View style={styles.screen}>
        <MenuErrorCard savedCopyTime={null} onRetry={loadMenus} onShowSavedCopy={() => {}} />
      </View>
    );
  }

  if (!allergens) return <ActivityIndicator style={styles.loading} color={colors.maroon600} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.pageTitle}>Dietary Filters</Text>
      <View style={styles.rule} />

      <Text style={styles.sectionTitle}>Avoid allergens</Text>
      <View style={styles.thinRule} />
      <View style={styles.chipRow}>
        {allergens.map((a) => (
          <Pressable key={a} style={[styles.chip, prefs.allergensToAvoid.includes(a) && styles.chipActive]} onPress={() => toggleAllergen(a)} accessibilityRole="button">
            <Text style={[styles.chipText, prefs.allergensToAvoid.includes(a) && styles.chipTextActive]}>{a}</Text>
          </Pressable>
        ))}
      </View>
      {allergens.length === 0 && <EmptyState title="No allergen data" message="No allergen data found in today's menus." />}

      <Text style={styles.sectionTitle}>Require diet tags</Text>
      <View style={styles.thinRule} />
      <View style={styles.chipRow}>
        {dietTags.map((t) => (
          <Pressable key={t} style={[styles.chip, prefs.requiredDietTags.includes(t) && styles.chipActive]} onPress={() => toggleDietTag(t)} accessibilityRole="button">
            <Text style={[styles.chipText, prefs.requiredDietTags.includes(t) && styles.chipTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      {dietTags.length === 0 && <EmptyState title="No diet-tag data" message="No diet-tag data found in today's menus." />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream100 },
  loading: { flex: 1, backgroundColor: colors.cream100 },
  container: { padding: spacing(4), paddingBottom: spacing(10) },
  pageTitle: { fontFamily: fonts.display, fontSize: 24, fontWeight: "700", textTransform: "uppercase", color: colors.maroon900 },
  rule: { marginTop: spacing(2), marginBottom: spacing(2), height: 0, borderTopWidth: 4, borderBottomWidth: 1, borderColor: colors.gold500 },
  sectionTitle: {
    marginTop: spacing(6),
    fontFamily: fonts.display,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  thinRule: { marginTop: spacing(1), marginBottom: spacing(3), height: 1, backgroundColor: withOpacity(colors.ink900, 25) },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2) },
  chip: { paddingVertical: spacing(1.5), paddingHorizontal: spacing(3), borderRadius: 999, borderWidth: 1, borderColor: colors.maroon600 },
  chipActive: { backgroundColor: colors.maroon600 },
  chipText: { color: colors.maroon600, fontFamily: fonts.body, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.paper50 },
});
