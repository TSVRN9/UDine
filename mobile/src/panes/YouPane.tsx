import { computeDailyTotals, hallCompletion, hallNameFor, isoDateOf, rankDiningHalls, type Favorite, type HallCompletion, type LogEntry, type RankedDish, type RankedFood } from "@udine/shared";
import { router, useFocusEffect } from "expo-router";
import { Fragment, useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Press } from "../components/Press";
import { Card, EmptyState, SectionHeader, Stat } from "../components/ui";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";
import { todayIso } from "../lib/date";
import { getCachedHours } from "../lib/menuHoursCache";
import { SqliteLogStorage } from "../lib/sqliteStorage";
import { SqliteRankingStorage } from "../lib/rankingStorage";
import { SqliteSeenDishesStorage } from "../lib/seenDishesStorage";
import { SqliteFavoritesStorage } from "../lib/favoritesStorage";
import { buildTopFoods, displayCompletionPct, entryCalories, groupEntriesByMeal, logItemLine } from "../lib/youPaneFormat";

const logStorage = new SqliteLogStorage();
const rankingStorage = new SqliteRankingStorage();
const seenDishesStorage = new SqliteSeenDishesStorage();
const favoritesStorage = new SqliteFavoritesStorage();

// YOUR TOP FOODS row cap — keeps the pane's chip-row density in line with the canvas rather than
// rendering every food that ever cleared the scoring gate.
const TOP_FOODS_LIMIT = 5;

// FAVORITES row cap, same "handful" convention as TOP_FOODS_LIMIT -- SEE ALL (-> /favorites) is
// the full list. getFavorites() has no ORDER BY (favoritesStorage.ts), so which favorites show up
// in the handful is whatever order SQLite's table scan happens to return, not "most recent".
const FAVORITES_LIMIT = 5;

function goToFavorites() {
  router.push("/favorites");
}

// `/logs` is a real route: no `as Href` cast needed, and no try/catch -- expo-router doesn't throw
// on an unmatched push, it renders its own +not-found screen.
function goToAllLogs() {
  router.push("/logs");
}

// #454: moved here from PaneHeader.tsx -- the export action used to be a conditionally-mounted
// icon button in the fixed cross-pane header, which shifted the pane-position dots' on-screen
// position every time it mounted/unmounted (i.e. whenever the user switched to/away from You).
// Same router.push mechanism as goToAllLogs/goToFavorites above.
function goToExport() {
  router.push("/export");
}

/** One completion bar inside the shared card — gold fill for the top (first) hall, maroon for the
 * rest, per the You artboard. */
function CompletionBar({ completion, gold }: { completion: HallCompletion; gold: boolean }) {
  const pct = displayCompletionPct(completion);
  return (
    <View style={styles.completionRow}>
      <View style={styles.completionHeader}>
        <Text style={styles.completionHall}>{hallNameFor(completion.hallTid)}</Text>
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

/** Bell glyph (not a star) -- favoriting here is a notify+highlight toggle, never a rating, and a
 * star would read as one. Path from YouPaneGrouped.dc.html's bell SVG. */
function BellIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
      <Path
        d="M8 2.5c-2 0-3.2 1.6-3.2 3.6v2.1L3.5 10.5h9L11.2 8.2V6.1c0-2-1.2-3.6-3.2-3.6z"
        stroke={colors.maroon600}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <Path d="M6.6 12.2a1.5 1.5 0 0 0 2.8 0" stroke={colors.maroon600} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

/** One favorite row: bell icon + name -- the bell alone (not a star) is the notify+highlight
 * disambiguation from the read-only Elo sections below it; no caption spelling that out in words. */
function FavoriteRow({ favorite }: { favorite: Favorite }) {
  return (
    <Card style={styles.favoriteRow}>
      <BellIcon />
      <View style={styles.favoriteRowInfo}>
        <Text style={styles.favoriteRowText}>{favorite.type === "dish" ? favorite.dishName : hallNameFor(favorite.hallTid)}</Text>
      </View>
    </Card>
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
 * The You pane's internals: macro stat card, today's log, HALL COMPLETION bars, YOUR TOP FOODS
 * 0-10 pills, FAVORITE HALLS chips.
 *
 * MVP cut: the Account section (sign-in/out, Friends, Your data links) is shelved along with
 * friends/account -- Top Foods/Favorite Halls stay as read-only stats even though ranking (their
 * data source) is cut too, so they freeze at whatever data is already on the device. Deliberate,
 * not an oversight.
 */
export function YouPane() {
  const [allEntries, setAllEntries] = useState<LogEntry[]>([]);
  const [rankedDishes, setRankedDishes] = useState<RankedDish[]>([]);
  const [rankedFoods, setRankedFoods] = useState<RankedFood[]>([]);
  const [seenByHall, setSeenByHall] = useState<Map<number, string[]>>(new Map());
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const insets = useSafeAreaInsets();
  const [, forceRetailNamesRerender] = useState(0);

  // PaneStack keeps this pane permanently mounted alongside HomePane, so useFocusEffect(load)
  // below (route focus, not pane visibility) is the only per-view hook this pane gets -- Today's
  // Log's SQLite read can otherwise resolve and render a café entry as "Hall <tid>" before
  // HomePane's own network hours fetch has taught retailHallNames.ts that tid's real name, with
  // nothing to ever re-render and correct it. getCachedHours() is cache-only/no-network and
  // already teaches that map on a cache hit -- hydrate from it once (mount-only) and force one
  // re-render once it resolves so a cold start self-corrects.
  useEffect(() => {
    getCachedHours().then(() => forceRetailNamesRerender((n) => n + 1));
  }, []);

  const load = useCallback(() => {
    logStorage.getAllEntries().then(setAllEntries);
    rankingStorage.getRankedDishes().then(setRankedDishes);
    rankingStorage.getRankedFoods().then(setRankedFoods);
    seenDishesStorage.getAllSeenDishNames().then(setSeenByHall);
    favoritesStorage.getFavorites().then(setFavorites);
  }, []);

  useFocusEffect(load);

  const date = todayIso();
  const todaysEntries = allEntries.filter((e) => isoDateOf(e.loggedAt) === date);
  const totals = computeDailyTotals(date, todaysEntries);
  const mealGroups = groupEntriesByMeal(todaysEntries);
  // Derived from the same rounded-per-entry sums the meal groups themselves use (not
  // Math.round(totals.calories), a separately-rounded raw-float sum) so this always agrees with
  // the meal groups' subtotals exactly, not just approximately.
  const displayedCalories = mealGroups.reduce((sum, g) => sum + g.totalCalories, 0);
  const completions = hallCompletion(seenByHall, allEntries);
  const hallRanking = rankDiningHalls(rankedDishes);
  const topFoods = buildTopFoods(rankedFoods, rankedDishes, allEntries, TOP_FOODS_LIMIT);

  return (
    <ScrollView style={styles.paneScroll} contentContainerStyle={[styles.paneContainer, { paddingTop: insets.top + fs(52) + spacing(2.5) }]}>
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
            <Press style={styles.allLogsLink} onPress={goToAllLogs} accessibilityRole="button">
              <Text style={styles.allLogsText}>ALL LOGS</Text>
              <Text style={styles.allLogsChevron}>›</Text>
            </Press>
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
        <SectionHeader
          title="Hall Completion"
          right={
            <Press style={styles.allLogsLink} onPress={goToExport} accessibilityRole="button">
              <Text style={styles.allLogsText}>EXPORT</Text>
              <Text style={styles.allLogsChevron}>›</Text>
            </Press>
          }
        />
        <Card style={styles.completionCard}>
          {completions.map((c, i) => (
            <CompletionBar key={c.hallTid} completion={c} gold={i === 0} />
          ))}
        </Card>
      </View>

      {/* "Your Food": Notifications, Your Top Foods, and Favorite Halls visually grouped under one
          shared heading -- a heavier rule marks the group, each of the three keeps its own
          lighter SectionHeader sub-header inside it. */}
      <View style={styles.group}>
        <View style={styles.groupHeader}>
          <View style={styles.groupRule} />
          <Text style={styles.groupTitle}>Your Food</Text>
        </View>

        <View style={styles.subsection}>
          {/* accessibilityLabel is explicit, not left to the rendered "SEE ALL ›" children -- it
              disambiguates this from ALL LOGS' identical-looking link. */}
          <SectionHeader
            title="Notifications"
            variant="subtle"
            right={
              <Press style={styles.allLogsLink} onPress={goToFavorites} accessibilityRole="button" accessibilityLabel="See all notifications">
                <Text style={styles.seeAllText}>SEE ALL</Text>
                <Text style={styles.seeAllChevron}>›</Text>
              </Press>
            }
          />
          {favorites.length === 0 ? (
            <EmptyState title="No notifications yet" />
          ) : (
            <View style={styles.rowList}>
              {favorites.slice(0, FAVORITES_LIMIT).map((f, i) => (
                <FavoriteRow key={`${f.type}-${f.type === "dish" ? f.dishName : f.hallTid}-${i}`} favorite={f} />
              ))}
            </View>
          )}
        </View>

        <View style={styles.subsection}>
          <SectionHeader title="Your Top Foods" variant="subtle" />
          {rankedFoods.length === 0 ? (
            <EmptyState title="No comparisons yet" />
          ) : topFoods.length === 0 ? (
            <EmptyState title="Not enough data yet" />
          ) : (
            <View style={styles.rowList}>
              {topFoods.map((f) => (
                <TopFoodRow key={f.dishName} dishName={f.dishName} score={f.score} hallName={f.hallName} tone={f.tone} />
              ))}
            </View>
          )}
        </View>

        <View style={styles.subsection}>
          <SectionHeader title="Favorite Halls" variant="subtle" />
          {hallRanking.ranked.length === 0 ? (
            <EmptyState title="No ranking yet" />
          ) : (
            <View style={styles.favoriteHallsRow}>
              {hallRanking.ranked.slice(0, 3).map((h, i) => (
                <Card key={h.hallTid} style={[styles.favoriteHallCard, i === 0 && styles.favoriteHallCardTop]}>
                  <Text style={[styles.favoriteHallRank, i === 0 && styles.favoriteHallRankTop]}>{h.rank}</Text>
                  <Text style={styles.favoriteHallName}>{hallNameFor(h.hallTid)}</Text>
                </Card>
              ))}
            </View>
          )}
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  paneScroll: { flex: 1, backgroundColor: colors.cream100 },
  paneContainer: { paddingHorizontal: spacing(5), paddingBottom: spacing(10) },

  section: { marginTop: spacing(4), gap: spacing(2.5) },

  // "Your Food" group: a heavier rule + its own title mark the group as a whole; each subsection
  // inside keeps the normal (lighter) SectionHeader gold rule, unchanged.
  group: { marginTop: spacing(5), gap: spacing(3.5) },
  groupHeader: { gap: spacing(1.5) },
  groupRule: { borderTopWidth: 2, borderTopColor: colors.gold500 },
  groupTitle: { fontFamily: fonts.display700, fontSize: fs(14), letterSpacing: 1.8, textTransform: "uppercase", color: colors.gold500 },
  subsection: { gap: spacing(2.5) },

  favoriteRow: { flexDirection: "row", alignItems: "center", gap: spacing(2.5), paddingVertical: spacing(2.5), paddingHorizontal: spacing(3.5) },
  favoriteRowInfo: { flexShrink: 1 },
  favoriteRowText: { fontFamily: fonts.body600, fontSize: fs(14), color: colors.ink900 },

  statsCard: { marginTop: spacing(3.5), padding: spacing(3.5), flexDirection: "row", gap: spacing(2.5) },
  statCell: { flex: 1 },

  rowList: { gap: spacing(2) },

  // ALL LOGS link -- SectionHeader's `right` slot, after the gold rule (canvas spec).
  allLogsLink: { flexDirection: "row", alignItems: "center", gap: spacing(1) },
  allLogsText: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, color: colors.maroon600 },
  allLogsChevron: { fontFamily: fonts.body400, fontSize: fs(12), color: colors.maroon600 },
  // SEE ALL (Favorites) is smaller than ALL LOGS -- YouPaneGrouped.dc.html:80-81 specs 10px for
  // both the text and the chevron, distinct from ALL LOGS' 11px/12px.
  seeAllText: { fontFamily: fonts.body600, fontSize: fs(10), letterSpacing: 0.5, color: colors.maroon600 },
  seeAllChevron: { fontFamily: fonts.body400, fontSize: fs(10), color: colors.maroon600 },

  // Today's Log, meal-grouped: one card, per-meal header + subtotal, single-line item rows, a
  // hairline divider between meal groups.
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
});
