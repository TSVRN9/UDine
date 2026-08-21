import { syncSharedStat, type SharedStatField } from "@udine/shared";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { EmptyState } from "../components/ui";
import { colors, fonts, fs, spacing, withOpacity } from "../lib/theme";
import { deriveSharedStatsPayloads, fieldsNeedingRefresh, sharedStatValueForToggle } from "../lib/privacySettings";
import { supabase } from "../lib/supabase";
import { SqliteLogStorage } from "../lib/sqliteStorage";
import { SqliteRankingStorage } from "../lib/rankingStorage";
import { SqliteSeenDishesStorage } from "../lib/seenDishesStorage";

const logStorage = new SqliteLogStorage();
const rankingStorage = new SqliteRankingStorage();
const seenDishesStorage = new SqliteSeenDishesStorage();

type SharedStatsRow = { completion: unknown; top_foods: unknown; hall_ranks: unknown } | null;

const TOGGLES: { field: SharedStatField; label: string }[] = [
  { field: "completion", label: "Share hall completion with friends" },
  { field: "top_foods", label: "Share top foods with friends" },
  { field: "hall_ranks", label: "Share hall ranking with friends" },
];

/**
 * #94: three independent, default-off toggles -- "opt-in per stat" per the epic #87 privacy
 * decision. Each toggle's on/off state IS the presence/absence of that column in the caller's own
 * `shared_stats` row (read on focus below) -- there's no separate local settings store to drift out
 * of sync with the server, since presence-on-the-server is the single source of truth for "is this
 * currently shared" (same "privacy by presence" the schema itself enforces).
 *
 * Toggling on computes the current derived stat from the same device-local storages YouPane reads
 * (deriveSharedStatsPayloads) and pushes it. Toggling off pushes `null`, which the shared_stats RLS
 * migration's check constraints + syncSharedStat's contract turn into an actual delete of that
 * field, not just a pause. On every focus, any field that's ALREADY on gets re-pushed with a fresh
 * derived value (fieldsNeedingRefresh) -- "future refreshes update it" -- but a field that isn't on
 * is never touched, so simply opening this screen (or coming back to it) can't opt anyone into
 * anything.
 */
export default function PrivacyScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [row, setRow] = useState<SharedStatsRow>(null);
  const [pending, setPending] = useState<SharedStatField | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    const myId = session?.user.id;
    if (!myId) return;

    const { data } = await supabase.from("shared_stats").select("completion, top_foods, hall_ranks").eq("user_id", myId).maybeSingle();
    setRow(data ?? null);

    // Re-push already-opted-in fields with a fresh value -- never opts a new field in (see the
    // module doc comment above and fieldsNeedingRefresh's own doc comment).
    const toRefresh = fieldsNeedingRefresh(data ?? null);
    if (toRefresh.length === 0) return;

    const [seenByHall, allEntries, rankedDishes, rankedFoods] = await Promise.all([
      seenDishesStorage.getAllSeenDishNames(),
      logStorage.getAllEntries(),
      rankingStorage.getRankedDishes(),
      rankingStorage.getRankedFoods(),
    ]);
    const derived = deriveSharedStatsPayloads(seenByHall, allEntries, rankedDishes, rankedFoods);
    for (const field of toRefresh) {
      await syncSharedStat(supabase, myId, field, sharedStatValueForToggle(field, true, derived));
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function toggle(field: SharedStatField, next: boolean) {
    const myId = session?.user.id;
    if (!myId) return;
    setPending(field);
    try {
      let value: unknown = null;
      if (next) {
        const [seenByHall, allEntries, rankedDishes, rankedFoods] = await Promise.all([
          seenDishesStorage.getAllSeenDishNames(),
          logStorage.getAllEntries(),
          rankingStorage.getRankedDishes(),
          rankingStorage.getRankedFoods(),
        ]);
        const derived = deriveSharedStatsPayloads(seenByHall, allEntries, rankedDishes, rankedFoods);
        value = sharedStatValueForToggle(field, true, derived);
      }
      const { error } = await syncSharedStat(supabase, myId, field, value);
      if (error) {
        console.warn(`[privacy] toggle(${field}, ${next}) failed`, error);
        return;
      }
      setRow((prev) => ({ completion: prev?.completion ?? null, top_foods: prev?.top_foods ?? null, hall_ranks: prev?.hall_ranks ?? null, [field]: value }));
    } finally {
      setPending(null);
    }
  }

  if (!session) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
        <EmptyState title="Sign in required" message="Sign in to control what friends can see." />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.hint}>Off by default. Turning a stat on shares it with accepted friends only; turning it back off removes it immediately.</Text>
      {TOGGLES.map(({ field, label }) => (
        <View key={field} style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{label}</Text>
          <Switch
            value={row?.[field] != null}
            onValueChange={(next) => toggle(field, next)}
            disabled={pending === field}
            trackColor={{ true: colors.maroon600 }}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream100 },
  container: { padding: spacing(4), paddingBottom: spacing(10), gap: spacing(4) },
  hint: { color: withOpacity(colors.ink900, 65), fontSize: fs(13), fontFamily: fonts.body400 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing(3), paddingVertical: spacing(2) },
  toggleLabel: { flex: 1, fontSize: fs(15), fontFamily: fonts.body400, color: colors.ink900 },
});
