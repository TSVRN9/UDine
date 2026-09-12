import { DINING_HALLS, fetchMenu, type FoodPreferences } from "@udine/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "../components/ui";
import { MenuErrorCard } from "../components/MenuErrorCard";
import { colors, fonts, spacing, withOpacity } from "../lib/theme";
import { getCachedPreferences, getPreferences, setPreferences, toggleAllergen, toggleDietTag } from "../lib/preferences";

export default function FiltersScreen() {
  const [allergens, setAllergens] = useState<string[] | null>(null);
  const [dietTags, setDietTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Same cache-seeding as halls/[slug].tsx -- avoids painting every chip unset, then flipping to
  // saved state a frame later once getPreferences() below resolves.
  const [prefs, setPrefs] = useState<FoodPreferences>(() => getCachedPreferences() ?? { allergensToAvoid: [], requiredDietTags: [] });
  // Generation counter: incremented per loadMenus() call and on unmount, so a stale response from
  // an earlier call can't clobber a later one's result/error.
  const generation = useRef(0);

  // Reuses MenuErrorCard (no saved-copy concept here, so savedCopyTime is always null and its
  // link never renders).
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

  function onToggleAllergen(allergen: string) {
    const updated = toggleAllergen(prefs, allergen);
    setPrefs(updated);
    setPreferences(updated);
  }

  function onToggleDietTag(tag: string) {
    const updated = toggleDietTag(prefs, tag);
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
          <Pressable
            key={a}
            style={[styles.chip, prefs.allergensToAvoid.includes(a) && styles.chipActive]}
            onPress={() => onToggleAllergen(a)}
            accessibilityRole="button"
            accessibilityLabel={`Allergen ${a}`}
          >
            <Text style={[styles.chipText, prefs.allergensToAvoid.includes(a) && styles.chipTextActive]}>{a}</Text>
          </Pressable>
        ))}
      </View>
      {allergens.length === 0 && <EmptyState title="No allergen data" message="No allergen data found in today's menus." />}

      <Text style={styles.sectionTitle}>Require diet tags</Text>
      <View style={styles.thinRule} />
      <View style={styles.chipRow}>
        {dietTags.map((t) => (
          <Pressable
            key={t}
            style={[styles.chip, prefs.requiredDietTags.includes(t) && styles.chipActive]}
            onPress={() => onToggleDietTag(t)}
            accessibilityRole="button"
            accessibilityLabel={`Diet tag ${t}`}
          >
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
