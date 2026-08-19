import {
  computeDailyTotals,
  DINING_HALLS,
  exportEntriesAsCsv,
  exportEntriesAsJson,
  hallCompletion,
  rankDiningHalls,
  type HallCompletion,
  type LogEntry,
  type RankedDish,
  type RankedFood,
} from "@udine/shared";
import type { Session } from "@supabase/supabase-js";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Link, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { PaneHeader } from "../components/PaneHeader";
import { Button, Card, EmptyState, Stat } from "../components/ui";
import { colors, fonts, radii, spacing, withOpacity } from "../lib/theme";
import { todayIso } from "../lib/date";
import { signInWithGoogle, signOut } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { SqliteLogStorage } from "../lib/sqliteStorage";
import { SqliteRankingStorage } from "../lib/rankingStorage";
import { SqliteSeenDishesStorage } from "../lib/seenDishesStorage";
import { buildTopFoods, displayCompletionPct } from "../lib/youPaneFormat";

const logStorage = new SqliteLogStorage();
const rankingStorage = new SqliteRankingStorage();
const seenDishesStorage = new SqliteSeenDishesStorage();

// YOUR TOP FOODS row cap — keeps the pane's chip-row density in line with the canvas rather than
// rendering every food that ever cleared the scoring gate.
const TOP_FOODS_LIMIT = 5;

function hallName(hallTid: number): string {
  return DINING_HALLS.find((h) => h.tid === hallTid)?.name ?? `Hall ${hallTid}`;
}

function CompletionBar({ completion }: { completion: HallCompletion }) {
  const pct = displayCompletionPct(completion);
  return (
    <View style={styles.completionRow}>
      <View style={styles.completionHeader}>
        <Text style={styles.completionHall}>{hallName(completion.hallTid)}</Text>
        <Text style={styles.completionCounts}>
          {completion.loggedDistinct}/{completion.seenDistinct} · {pct}%
        </Text>
      </View>
      <View style={styles.completionTrack}>
        <View style={[styles.completionFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

function TopFoodPill({ dishName, score, hallName: hall, tone }: { dishName: string; score: number; hallName: string | null; tone: "gold" | "maroon" }) {
  return (
    <Card style={styles.topFoodRow}>
      <View style={styles.topFoodInfo}>
        <Text style={styles.topFoodName}>{dishName}</Text>
        {hall && <Text style={styles.topFoodHall}>{hall}</Text>}
      </View>
      <View style={[styles.scorePill, tone === "gold" ? styles.scorePillGold : styles.scorePillMaroon]}>
        <Text style={[styles.scorePillText, tone === "gold" ? styles.scorePillTextGold : styles.scorePillTextMaroon]}>{score.toFixed(1)}</Text>
      </View>
    </Card>
  );
}

/**
 * The You pane's internals (#92): macro stat card, today's log, HALL COMPLETION bars (#89, fed by
 * #91's menu fetch once it adopts menuFetchWithSeenTracking.ts — see that file's doc comment),
 * YOUR TOP FOODS 0-10 pills (#89), FAVORITE HALLS chips, Account/Friends rows. Extracted out of
 * app/index.tsx into its own file so PaneShellScreen's diff there stays a mechanical import swap.
 */
export function YouPane({ activeIndex }: { activeIndex: number }) {
  const [session, setSession] = useState<Session | null>(null);
  const [allEntries, setAllEntries] = useState<LogEntry[]>([]);
  const [rankedDishes, setRankedDishes] = useState<RankedDish[]>([]);
  const [rankedFoods, setRankedFoods] = useState<RankedFood[]>([]);
  const [seenByHall, setSeenByHall] = useState<Map<number, string[]>>(new Map());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => subscription.unsubscribe();
  }, []);

  const load = useCallback(() => {
    logStorage.getAllEntries().then(setAllEntries);
    rankingStorage.getRankedDishes().then(setRankedDishes);
    rankingStorage.getRankedFoods().then(setRankedFoods);
    seenDishesStorage.getAllSeenDishNames().then(setSeenByHall);
  }, []);

  useFocusEffect(load);

  async function handleSignIn() {
    try {
      await signInWithGoogle();
    } catch (err) {
      Alert.alert("Sign-in failed", err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(id: string) {
    await logStorage.removeEntry(id);
    load();
  }

  async function exportData(format: "json" | "csv") {
    const content = format === "json" ? exportEntriesAsJson(allEntries) : exportEntriesAsCsv(allEntries);
    const path = `${FileSystem.cacheDirectory}udine-export.${format}`;
    await FileSystem.writeAsStringAsync(path, content);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path);
    }
  }

  const date = todayIso();
  const todaysEntries = allEntries.filter((e) => e.loggedAt.startsWith(date));
  const totals = computeDailyTotals(date, todaysEntries);
  const completions = hallCompletion(seenByHall, allEntries);
  const hallRanking = rankDiningHalls(rankedDishes);
  const topFoods = buildTopFoods(rankedFoods, rankedDishes, allEntries, TOP_FOODS_LIMIT);

  return (
    <ScrollView style={styles.paneScroll} contentContainerStyle={styles.paneContainer}>
      <PaneHeader title="You" activeIndex={activeIndex} />

      <Card style={styles.statsCard}>
        <View style={styles.statsGrid}>
          <View style={styles.statCell}>
            <Stat label="Calories" value={String(Math.round(totals.calories))} />
          </View>
          <View style={styles.statCell}>
            <Stat label="Protein" value={`${totals.proteinG.toFixed(1)}g`} />
          </View>
          <View style={styles.statCell}>
            <Stat label="Carbs" value={`${totals.totalCarbG.toFixed(1)}g`} />
          </View>
          <View style={styles.statCell}>
            <Stat label="Fat" value={`${totals.totalFatG.toFixed(1)}g`} />
          </View>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Today's log</Text>
      <View style={styles.thinRule} />
      {todaysEntries.length === 0 ? (
        <EmptyState title="Nothing logged yet" message="Browse a dining hall menu and log anything you eat." />
      ) : (
        <View style={styles.logList}>
          {todaysEntries.map((entry) => (
            <Card key={entry.id} style={styles.logRow}>
              <Text style={styles.logRowText}>
                {entry.source.type === "umass-menu" ? entry.source.dishName : entry.source.productName} × {entry.servings}
              </Text>
              <Button variant="ghost" size="sm" onPress={() => remove(entry.id)}>
                Remove
              </Button>
            </Card>
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>Hall completion</Text>
      <Text style={styles.hint}>Distinct dishes you've logged out of everything this device has seen offered.</Text>
      <View style={styles.thinRule} />
      <View style={styles.completionList}>
        {completions.map((c) => (
          <CompletionBar key={c.hallTid} completion={c} />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Your top foods</Text>
      <View style={styles.thinRule} />
      {rankedFoods.length === 0 ? (
        <EmptyState title="No comparisons yet" message="Rank a few dishes you've logged to build your top foods." />
      ) : topFoods.length === 0 ? (
        <EmptyState title="Almost there" message="Compare a food a couple more times to unlock its score." />
      ) : (
        <View style={styles.topFoodsList}>
          {topFoods.map((f, i) => (
            <TopFoodPill key={f.dishName} dishName={`${i + 1}. ${f.dishName}`} score={f.score} hallName={f.hallName} tone={f.tone} />
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>Favorite halls</Text>
      <View style={styles.thinRule} />
      {hallRanking.ranked.length === 0 ? (
        <EmptyState title="No ranking yet" message="Compare dishes at a hall to see it show up here." />
      ) : (
        <View style={styles.favoriteHallsRow}>
          {hallRanking.ranked.slice(0, 3).map((h) => (
            <View key={h.hallTid} style={styles.favoriteHallChip}>
              <Text style={styles.favoriteHallRank}>{h.rank}</Text>
              <Text style={styles.favoriteHallName}>{hallName(h.hallTid)}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.thinRule} />
      <View style={styles.accountRow}>
        {session ? (
          <>
            <Text style={styles.accountText}>Signed in as {session.user.email}</Text>
            <Pressable onPress={() => signOut()}>
              <Text style={styles.accountLink}>Sign out</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={handleSignIn}>
            <Text style={styles.accountLink}>Sign in with Google</Text>
          </Pressable>
        )}
      </View>
      <Link href="/friends" asChild>
        <Pressable style={styles.friendsRow}>
          <Text style={styles.friendsText}>Friends</Text>
          <Text style={styles.friendsChevron}>›</Text>
        </Pressable>
      </Link>

      <Text style={styles.sectionTitle}>Export your data</Text>
      <View style={styles.thinRule} />
      <View style={styles.exportRow}>
        <Button variant="secondary" style={styles.exportButton} onPress={() => exportData("json")}>
          Export JSON
        </Button>
        <Button variant="secondary" style={styles.exportButton} onPress={() => exportData("csv")}>
          Export CSV
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  paneScroll: { flex: 1, backgroundColor: colors.cream100 },
  paneContainer: { padding: spacing(4), paddingBottom: spacing(10) },

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
  hint: { marginTop: spacing(1), fontFamily: fonts.body, fontSize: 12, color: withOpacity(colors.ink900, 55) },

  statsCard: { padding: spacing(4) },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing(4) },
  statCell: { minWidth: "40%", flexGrow: 1 },

  logList: { gap: spacing(2) },
  logRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing(3) },
  logRowText: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.ink900 },

  completionList: { gap: spacing(3) },
  completionRow: { gap: spacing(1) },
  completionHeader: { flexDirection: "row", justifyContent: "space-between" },
  completionHall: { fontFamily: fonts.body, fontWeight: "600", fontSize: 13, color: colors.ink900 },
  completionCounts: { fontFamily: fonts.mono, fontSize: 12, color: withOpacity(colors.ink900, 60) },
  completionTrack: { height: 6, borderRadius: radii.pill, backgroundColor: withOpacity(colors.ink900, 12), overflow: "hidden" },
  completionFill: { height: "100%", borderRadius: radii.pill, backgroundColor: colors.maroon600 },

  topFoodsList: { gap: spacing(2) },
  topFoodRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing(3) },
  topFoodInfo: { flex: 1 },
  topFoodName: { fontFamily: fonts.body, fontSize: 14, fontWeight: "600", color: colors.ink900 },
  topFoodHall: { marginTop: 2, fontFamily: fonts.body, fontSize: 11, color: withOpacity(colors.ink900, 55) },
  scorePill: { minWidth: 40, alignItems: "center", borderRadius: radii.pill, paddingVertical: spacing(1), paddingHorizontal: spacing(2) },
  scorePillGold: { backgroundColor: colors.gold500 },
  scorePillMaroon: { backgroundColor: colors.maroon600 },
  scorePillText: { fontFamily: fonts.mono, fontSize: 14, fontWeight: "700" },
  scorePillTextGold: { color: colors.maroon900 },
  scorePillTextMaroon: { color: colors.paper50 },

  favoriteHallsRow: { flexDirection: "row", gap: spacing(2) },
  favoriteHallChip: {
    flex: 1,
    alignItems: "center",
    gap: spacing(1),
    borderRadius: radii.md,
    backgroundColor: colors.maroon900,
    paddingVertical: spacing(3),
  },
  favoriteHallRank: { fontFamily: fonts.display, fontSize: 20, fontWeight: "700", color: colors.gold500 },
  favoriteHallName: { fontFamily: fonts.body, fontSize: 12, fontWeight: "600", color: colors.paper50, textTransform: "uppercase" },

  accountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  accountText: { color: withOpacity(colors.ink900, 60), fontFamily: fonts.body, fontSize: 13 },
  accountLink: { color: colors.maroon600, fontFamily: fonts.body, fontWeight: "600", fontSize: 13 },

  friendsRow: {
    marginTop: spacing(3),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing(3),
    borderRadius: radii.md,
    backgroundColor: withOpacity(colors.ink900, 6),
  },
  friendsText: { fontFamily: fonts.body, fontWeight: "600", fontSize: 14, color: colors.ink900 },
  friendsChevron: { fontFamily: fonts.body, fontSize: 16, color: withOpacity(colors.ink900, 45) },

  exportRow: { flexDirection: "row", gap: spacing(2) },
  exportButton: { flex: 1 },
});
