import { computeDailyTotals, DEFAULT_ROLLOVER_HOUR, distinctLoggedDishes, effectiveDayOf, hallCompletion, hallNameFor, rankDiningHalls, type Favorite, type HallCompletion, type LogEntry, type RankedDish, type RankedFood } from "@udine/shared";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { CompareSheet } from "../components/CompareSheet";
import { Press } from "../components/Press";
import { Toast, useToastDwell, type ToastKind } from "../components/Toast";
import { compareFixture, dealPair, resolvePick, resolveSkip, type CompareCard } from "../lib/compare";
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

function TopFoodRow({ dishName, score, hallName: hall, comparisonCount, tone }: { dishName: string; score: number; hallName: string | null; comparisonCount: number; tone: "gold" | "maroon" }) {
  const counted = `${comparisonCount} comparisons`; // a food only ranks with 3+ comparisons (scoreOutOfTen)
  return (
    <Card style={styles.topFoodRow}>
      <View style={styles.topFoodInfo}>
        <Text style={styles.topFoodName}>{dishName}</Text>
        <Text style={styles.topFoodHall}>{hall ? `${hall} · ${counted}` : counted}</Text>
      </View>
      <View style={[styles.scorePill, tone === "gold" ? styles.scorePillGold : styles.scorePillOutlined]}>
        <Text style={[styles.scorePillText, tone === "gold" ? styles.scorePillTextGold : styles.scorePillTextOutlined]}>{score.toFixed(1)}</Text>
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

  // Dev-only `--stress compare-seed[-empty]` (screenshot.sh): logged dishes and an in-memory ranking
  // store, so the head-to-head entry points screenshot without touching the device's real log.
  const { stress } = useLocalSearchParams<{ stress?: string }>();
  // useMemo, not lazy state: the deep link that carries `stress` can land after this pane first mounts.
  const fixture = useMemo(() => (__DEV__ && (stress === "compare-seed" || stress === "compare-seed-empty") ? compareFixture(stress === "compare-seed") : null), [stress]);
  const ranking = fixture?.storage ?? rankingStorage;
  // Under the fixture the screenshot is one gesture (the swipe to this pane), so start scrolled to "Your Food".
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(() => {
    (fixture ? Promise.resolve(fixture.entries) : logStorage.getAllEntries()).then(setAllEntries);
    ranking.getRankedDishes().then(setRankedDishes);
    ranking.getRankedFoods().then(setRankedFoods);
    seenDishesStorage.getAllSeenDishNames().then(setSeenByHall);
    favoritesStorage.getFavorites().then(setFavorites);
  }, [fixture, ranking]);

  useFocusEffect(load);

  // Head-to-head (CompareSheet.dc.html). `comparePair` outlives the close so the slide-out keeps its content.
  const [compareOpen, setCompareOpen] = useState(false);
  const [comparePair, setComparePair] = useState<[CompareCard, CompareCard] | null>(null);
  const [toast, setToast] = useState<{ kind: ToastKind; message: string; subline?: string; action?: { label: string; pair: [CompareCard, CompareCard] } } | null>(null);
  useToastDwell(toast, setToast, !!fixture);
  // Two distinct logged dishes is the least there is to pair; below that neither entry point renders.
  const canCompare = distinctLoggedDishes(allEntries).length >= 2;

  function openCompare(pair: [CompareCard, CompareCard] | null) {
    if (!pair) return;
    setToast(null);
    setComparePair(pair);
    setCompareOpen(true);
  }

  // A pick is written on-device by resolvePick; the lists take its saved result, so Top Foods and
  // Favorite Halls update under the closing sheet. A failed save leaves the sheet up to retry.
  async function pickComparison(winner: CompareCard, loser: CompareCard) {
    try {
      const r = await resolvePick(ranking, allEntries, winner, loser);
      if (!r) return;
      setRankedDishes(r.dishes);
      setRankedFoods(r.foods);
      setCompareOpen(false);
      setToast({ kind: "success", message: r.message, subline: r.subline, action: r.next ? { label: "Another", pair: r.next } : undefined });
    } catch {
      // nothing was recorded
    }
  }

  async function skipComparison() {
    const next = await resolveSkip(ranking, allEntries, comparePair);
    if (next) setComparePair(next);
    else setCompareOpen(false);
  }

  const date = todayIso();
  // effectiveDayOf, not isoDateOf -- a raw-prefix match against `date` (an effective day) makes a
  // 12:30 AM entry (raw prefix already the new calendar day) invisible from Today's Log until the
  // clock crosses the rollover hour. See shared/src/date.ts's effectiveDayOf doc comment.
  const todaysEntries = allEntries.filter((e) => effectiveDayOf(e.loggedAt, DEFAULT_ROLLOVER_HOUR) === date);
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
    <View style={styles.pane}>
    <ScrollView ref={scrollRef} style={styles.paneScroll} contentContainerStyle={[styles.paneContainer, { paddingTop: insets.top + fs(52) + spacing(2.5) }]}>
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
      <View style={styles.group} onLayout={fixture ? (e) => scrollRef.current?.scrollTo({ y: e.nativeEvent.layout.y, animated: false }) : undefined}>
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
          <SectionHeader
            title="Your Top Foods"
            variant="subtle"
            growRule
            right={
              canCompare && rankedFoods.length > 0 ? (
                <Press style={styles.allLogsLink} onPress={() => openCompare(dealPair(allEntries, rankedDishes, null))} accessibilityRole="button">
                  <Text style={styles.seeAllText}>RANK MORE</Text>
                  <Text style={styles.seeAllChevron}>›</Text>
                </Press>
              ) : undefined
            }
          />
          {rankedFoods.length === 0 ? (
            canCompare ? (
              <Press style={styles.startComparing} onPress={() => openCompare(dealPair(allEntries, rankedDishes, null))} accessibilityRole="button">
                <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
                  <Path d="M4 7h11M12 4l3 3-3 3M16 13H5M8 10l-3 3 3 3" stroke={colors.maroon600} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                <View>
                  <Text style={styles.startComparingTitle}>Start comparing</Text>
                  <Text style={styles.startComparingSub}>No comparisons yet</Text>
                </View>
              </Press>
            ) : (
              <EmptyState title="No comparisons yet" />
            )
          ) : topFoods.length === 0 ? (
            <EmptyState title="Not enough data yet" />
          ) : (
            <View style={styles.rowList}>
              {topFoods.map((f) => (
                <TopFoodRow key={f.dishName} dishName={f.dishName} score={f.score} hallName={f.hallName} comparisonCount={f.comparisonCount} tone={f.tone} />
              ))}
            </View>
          )}
        </View>

        <View style={styles.subsection}>
          <SectionHeader title="Favorite Halls" variant="subtle" />
          {hallRanking.ranked.length === 0 ? (
            <Card style={styles.emptyHalls}>
              <Text style={styles.emptyHallsText}>No ranking yet</Text>
            </Card>
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
      {toast && (
        <Toast
          kind={toast.kind}
          message={toast.message}
          subline={toast.subline}
          action={toast.action && { label: toast.action.label, onPress: () => openCompare(toast.action!.pair) }}
          bottom={insets.bottom + spacing(4)}
          onDismiss={() => setToast(null)}
        />
      )}
      <CompareSheet visible={compareOpen} pair={comparePair} onPick={pickComparison} onSkip={skipComparison} onClose={() => setCompareOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
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
  // Every pill below the top score is outlined, not filled (YouTopFoodsRankMore.dc.html).
  scorePillOutlined: { borderWidth: 1, borderColor: withOpacity(colors.ink900, 20) },
  scorePillText: { fontFamily: fonts.mono, fontSize: fs(14), fontWeight: "600" },
  scorePillTextGold: { color: colors.maroon900 },
  scorePillTextOutlined: { color: colors.maroon900 },

  // YouTopFoodsEmpty.dc.html: the dashed maroon "Start comparing" row and the plain Favorite Halls line.
  startComparing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    minHeight: 44,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: withOpacity(colors.maroon600, 45),
    borderRadius: radii.md,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3.5),
  },
  startComparingTitle: { fontFamily: fonts.body600, fontSize: fs(13), color: colors.maroon600 },
  startComparingSub: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.ink900, 55) },
  emptyHalls: { paddingVertical: spacing(2.5), paddingHorizontal: spacing(3.5) },
  emptyHallsText: { fontFamily: fonts.body400, fontSize: fs(13), color: withOpacity(colors.ink900, 55) },

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
