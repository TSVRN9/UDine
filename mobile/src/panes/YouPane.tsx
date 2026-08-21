import {
  computeDailyTotals,
  DINING_HALLS,
  exportEntriesAsCsv,
  exportEntriesAsJson,
  hallCompletion,
  isoDateOf,
  rankDiningHalls,
  type HallCompletion,
  type LogEntry,
  type RankedDish,
  type RankedFood,
} from "@udine/shared";
import type { Session } from "@supabase/supabase-js";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Link, router, useFocusEffect, type Href } from "expo-router";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PaneHeader } from "../components/PaneHeader";
import { Button, Card, EmptyState, SectionHeader, Stat } from "../components/ui";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";
import { todayIso } from "../lib/date";
import { signInWithGoogle, signOut } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { SqliteLogStorage } from "../lib/sqliteStorage";
import { SqliteRankingStorage } from "../lib/rankingStorage";
import { SqliteSeenDishesStorage } from "../lib/seenDishesStorage";
import { buildTopFoods, displayCompletionPct, entryCalories, groupEntriesByMeal } from "../lib/youPaneFormat";

const logStorage = new SqliteLogStorage();
const rankingStorage = new SqliteRankingStorage();
const seenDishesStorage = new SqliteSeenDishesStorage();

// YOUR TOP FOODS row cap — keeps the pane's chip-row density in line with the canvas rather than
// rendering every food that ever cleared the scoring gate.
const TOP_FOODS_LIMIT = 5;

function hallName(hallTid: number): string {
  return DINING_HALLS.find((h) => h.tid === hallTid)?.name ?? `Hall ${hallTid}`;
}

/** Single-line item text per the canvas: "<dish> × <qty> · <hall>", qty omitted when it's 1, hall
 * omitted for off-menu (barcode) entries that don't have one. */
function logItemLine(entry: LogEntry): string {
  const name = entry.source.type === "umass-menu" ? entry.source.dishName : entry.source.productName;
  const qty = entry.servings !== 1 ? ` × ${entry.servings}` : "";
  const hall = entry.source.type === "umass-menu" ? ` · ${hallName(entry.source.hallTid)}` : "";
  return `${name}${qty}${hall}`;
}

/** #119's Logs & stats screen hasn't shipped yet -- `/logs` doesn't match a route until it does.
 * expo-router doesn't throw for an unmatched push (it renders its own `+not-found` screen), so no
 * try/catch here: review caught that the earlier version's catch was a real-error suppressor, not
 * a crash guard -- it's what silently swallowed a genuine `jest.mock` hoisting bug during
 * development. `as Href` stays: `app.json`'s `experiments.typedRoutes` rejects an unknown route at
 * compile time until #119 adds `app/logs.tsx`. */
function goToAllLogs() {
  router.push("/logs" as Href);
}

/** One completion bar inside the shared card — gold fill for the top (first) hall, maroon for the
 * rest, per the You artboard. */
function CompletionBar({ completion, gold }: { completion: HallCompletion; gold: boolean }) {
  const pct = displayCompletionPct(completion);
  return (
    <View style={styles.completionRow}>
      <View style={styles.completionHeader}>
        <Text style={styles.completionHall}>{hallName(completion.hallTid)}</Text>
        <Text style={styles.completionCounts}>
          {pct}% · {completion.loggedDistinct} of {completion.seenDistinct} dishes
        </Text>
      </View>
      <View style={styles.completionTrack}>
        <View style={[styles.completionFill, gold && styles.completionFillGold, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

function TopFoodRow({ dishName, score, hallName: hall, tone }: { dishName: string; score: number; hallName: string | null; tone: "gold" | "maroon" }) {
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
  const insets = useSafeAreaInsets();

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

  async function exportData(format: "json" | "csv") {
    // Fresh read, not the `allEntries` state closure -- a just-removed entry can otherwise still be
    // in the current render's `allEntries` if export is tapped before remove()'s reload flushes.
    // Matches today.tsx's original behavior (ported from, see PR #105's review).
    const entries = await logStorage.getAllEntries();
    const content = format === "json" ? exportEntriesAsJson(entries) : exportEntriesAsCsv(entries);
    const path = `${FileSystem.cacheDirectory}udine-export.${format}`;
    await FileSystem.writeAsStringAsync(path, content);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path);
    }
  }

  const date = todayIso();
  const todaysEntries = allEntries.filter((e) => isoDateOf(e.loggedAt) === date);
  const totals = computeDailyTotals(date, todaysEntries);
  const mealGroups = groupEntriesByMeal(todaysEntries);
  // Derived from the SAME rounded-per-entry sums the meal groups themselves use (not
  // Math.round(totals.calories), a separately-rounded raw-float sum) so this always agrees with
  // the meal groups' subtotals exactly, not just approximately -- see groupEntriesByMeal's doc
  // comment on why "round the total once" and "round each entry, then sum" can otherwise differ.
  const displayedCalories = mealGroups.reduce((sum, g) => sum + g.totalCalories, 0);
  const completions = hallCompletion(seenByHall, allEntries);
  const hallRanking = rankDiningHalls(rankedDishes);
  const topFoods = buildTopFoods(rankedFoods, rankedDishes, allEntries, TOP_FOODS_LIMIT);

  return (
    <ScrollView style={styles.paneScroll} contentContainerStyle={[styles.paneContainer, { paddingTop: insets.top + spacing(4.5) }]}>
      <PaneHeader title="You" activeIndex={activeIndex} />

      <Card style={styles.statsCard}>
        <View style={styles.statCell}>
          <Stat label="Calories" value={String(displayedCalories)} />
        </View>
        <View style={styles.statCell}>
          <Stat label="Protein" value={`${totals.proteinG.toFixed(0)}g`} />
        </View>
        <View style={styles.statCell}>
          <Stat label="Carbs" value={`${totals.totalCarbG.toFixed(0)}g`} />
        </View>
        <View style={styles.statCell}>
          <Stat label="Fat" value={`${totals.totalFatG.toFixed(0)}g`} />
        </View>
      </Card>

      <View style={styles.section}>
        <SectionHeader
          title="Today's Log"
          right={
            <Pressable style={styles.allLogsLink} onPress={goToAllLogs}>
              <Text style={styles.allLogsText}>ALL LOGS</Text>
              <Text style={styles.allLogsChevron}>›</Text>
            </Pressable>
          }
        />
        {todaysEntries.length === 0 ? (
          <EmptyState title="Nothing logged yet" message="Browse a dining hall menu and log anything you eat." />
        ) : (
          <Card style={styles.logCard}>
            {mealGroups.map((group, i) => (
              <Fragment key={group.period}>
                {i > 0 && <View style={styles.mealDivider} />}
                <View style={styles.mealGroup}>
                  <View style={styles.mealHeaderRow}>
                    <Text style={styles.mealHeaderLabel}>{group.label}</Text>
                    <Text style={styles.mealHeaderTotal}>{group.totalCalories} cal</Text>
                  </View>
                  {group.entries.map((entry) => (
                    <View key={entry.id} style={styles.mealItemRow}>
                      <Text style={styles.mealItemName}>{logItemLine(entry)}</Text>
                      <Text style={styles.mealItemCalories}>{entryCalories(entry)}</Text>
                    </View>
                  ))}
                </View>
              </Fragment>
            ))}
          </Card>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Hall Completion" />
        <Text style={styles.hint}>Distinct dishes you've logged out of everything this device has seen offered.</Text>
        <Card style={styles.completionCard}>
          {completions.map((c, i) => (
            <CompletionBar key={c.hallTid} completion={c} gold={i === 0} />
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Your Top Foods" />
        {rankedFoods.length === 0 ? (
          <EmptyState title="No comparisons yet" message="Rank a few dishes you've logged to build your top foods." />
        ) : topFoods.length === 0 ? (
          <EmptyState title="Almost there" message="Compare a food a couple more times to unlock its score." />
        ) : (
          <View style={styles.rowList}>
            {topFoods.map((f) => (
              <TopFoodRow key={f.dishName} dishName={f.dishName} score={f.score} hallName={f.hallName} tone={f.tone} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Favorite Halls" />
        {hallRanking.ranked.length === 0 ? (
          <EmptyState title="No ranking yet" message="Compare dishes at a hall to see it show up here." />
        ) : (
          <View style={styles.favoriteHallsRow}>
            {hallRanking.ranked.slice(0, 3).map((h, i) => (
              <Card key={h.hallTid} style={[styles.favoriteHallCard, i === 0 && styles.favoriteHallCardTop]}>
                <Text style={[styles.favoriteHallRank, i === 0 && styles.favoriteHallRankTop]}>{h.rank}</Text>
                <Text style={styles.favoriteHallName}>{hallName(h.hallTid)}</Text>
              </Card>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Account" />
        <Card style={styles.accountCard}>
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
        </Card>
        <Link href="/friends" asChild>
          <Pressable>
            <Card style={styles.friendsRow}>
              <Text style={styles.friendsText}>Friends</Text>
              <Text style={styles.friendsChevron}>›</Text>
            </Card>
          </Pressable>
        </Link>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Export Your Data" />
        <View style={styles.exportRow}>
          <Button variant="secondary" style={styles.exportButton} onPress={() => exportData("json")}>
            Export JSON
          </Button>
          <Button variant="secondary" style={styles.exportButton} onPress={() => exportData("csv")}>
            Export CSV
          </Button>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  paneScroll: { flex: 1, backgroundColor: colors.cream100 },
  paneContainer: { paddingHorizontal: spacing(5), paddingBottom: spacing(10) },

  section: { marginTop: spacing(4), gap: spacing(2.5) },
  hint: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.ink900, 55) },

  statsCard: { marginTop: spacing(3.5), padding: spacing(3.5), flexDirection: "row", gap: spacing(2.5) },
  statCell: { flex: 1 },

  rowList: { gap: spacing(2) },

  // ALL LOGS link -- SectionHeader's `right` slot, after the gold rule (canvas spec).
  allLogsLink: { flexDirection: "row", alignItems: "center", gap: spacing(1) },
  allLogsText: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, color: colors.maroon600 },
  allLogsChevron: { fontFamily: fonts.body400, fontSize: fs(12), color: colors.maroon600 },

  // Today's Log, meal-grouped (#118): one card, per-meal header + subtotal, single-line item rows,
  // a hairline divider between meal groups.
  logCard: { paddingVertical: spacing(3), paddingHorizontal: spacing(3.5), gap: spacing(2) },
  mealGroup: { gap: spacing(1.25) },
  mealHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  mealHeaderLabel: { fontFamily: fonts.display600, fontSize: fs(11), letterSpacing: 1.2, textTransform: "uppercase", color: colors.maroon900 },
  mealHeaderTotal: { fontFamily: fonts.mono, fontSize: fs(12), fontWeight: "600", color: withOpacity(colors.ink900, 70) },
  mealItemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  mealItemName: { flexShrink: 1, fontFamily: fonts.body400, fontSize: fs(13), color: colors.ink900 },
  mealItemCalories: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.ink900, 55) },
  mealDivider: { height: 1, backgroundColor: withOpacity(colors.ink900, 8) },

  completionCard: { paddingVertical: spacing(3), paddingHorizontal: spacing(3.5), gap: spacing(2.5) },
  completionRow: { gap: spacing(1) },
  completionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: spacing(2) },
  completionHall: { fontFamily: fonts.body600, fontSize: fs(12), color: colors.ink900 },
  completionCounts: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.ink900, 70) },
  completionTrack: { height: 6, borderRadius: radii.pill, backgroundColor: withOpacity(colors.ink900, 10), overflow: "hidden" },
  completionFill: { height: "100%", borderRadius: radii.pill, backgroundColor: colors.maroon600 },
  completionFillGold: { backgroundColor: colors.gold500 },

  topFoodRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing(2),
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3.5),
  },
  topFoodInfo: { flex: 1, gap: 1 },
  topFoodName: { fontFamily: fonts.body600, fontSize: fs(14), color: colors.ink900 },
  topFoodHall: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.ink900, 55) },
  scorePill: { minWidth: fs(44), alignItems: "center", borderRadius: radii.pill, paddingVertical: spacing(1.25) },
  scorePillGold: { backgroundColor: colors.gold500 },
  scorePillMaroon: { backgroundColor: colors.maroon600 },
  scorePillText: { fontFamily: fonts.mono, fontSize: fs(14), fontWeight: "600" },
  scorePillTextGold: { color: colors.maroon900 },
  scorePillTextMaroon: { color: colors.paper50 },

  favoriteHallsRow: { flexDirection: "row", gap: spacing(2) },
  favoriteHallCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3),
  },
  favoriteHallCardTop: { borderColor: colors.gold500 },
  favoriteHallRank: { fontFamily: fonts.display700, fontSize: fs(16), color: withOpacity(colors.ink900, 40) },
  favoriteHallRankTop: { color: colors.gold500 },
  favoriteHallName: { flexShrink: 1, fontFamily: fonts.body600, fontSize: fs(13), color: colors.ink900 },

  accountCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing(2),
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3.5),
    minHeight: fs(44),
  },
  accountText: { flexShrink: 1, color: withOpacity(colors.ink900, 60), fontFamily: fonts.body400, fontSize: fs(13) },
  accountLink: { color: colors.maroon600, fontFamily: fonts.body600, fontSize: fs(13) },
  friendsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3.5),
    minHeight: fs(44),
  },
  friendsText: { fontFamily: fonts.body600, fontSize: fs(13), color: colors.ink900 },
  friendsChevron: { fontFamily: fonts.body400, fontSize: fs(18), lineHeight: fs(20), color: colors.maroon600 },

  exportRow: { flexDirection: "row", gap: spacing(2) },
  exportButton: { flex: 1 },
});
