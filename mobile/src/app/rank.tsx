import {
  applyComparison,
  applyFoodComparison,
  hallNameFor,
  rankDiningHalls,
  rankDishes,
  rankFoods,
  syncDiningHallRanks,
  type LogEntry,
  type RankedDish,
  type RankedFood,
} from "@udine/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card } from "../components/ui";
import { colors, fonts, spacing, withOpacity } from "../lib/theme";
import { SqliteLogStorage } from "../lib/sqliteStorage";
import { SqliteRankingStorage } from "../lib/rankingStorage";
import { supabase } from "../lib/supabase";
import { type Dish, dishKey, pickPair } from "../lib/pairSelection";

const logStorage = new SqliteLogStorage();
const rankingStorage = new SqliteRankingStorage();

export default function RankScreen() {
  const [loggedDishes, setLoggedDishes] = useState<Dish[]>([]);
  const [rankedDishes, setRankedDishes] = useState<RankedDish[]>([]);
  const [rankedFoods, setRankedFoods] = useState<RankedFood[]>([]);
  const [pair, setPair] = useState<[Dish, Dish] | null>(null);
  const lastPairRef = useRef<[Dish, Dish] | null>(null);

  // #147: choose() reads/saves whole-blob rankedDishes/rankedFoods -- a second tap landing before
  // the first's two awaited saves + getSession finished used to compute from the same stale
  // render-closure state as the first, and its whole-blob save clobbered the first's write
  // (last-write-wins). React state updates don't apply synchronously within a single microtask
  // burst, so a plain guard that just re-reads `rankedDishes` state on the next call still sees the
  // pre-first-tap value. These two refs are the actual source of truth for choose() instead --
  // updated synchronously the moment a comparison applies, not on React's next render -- and
  // chooseQueueRef serializes overlapping calls so a second (legitimate) tap's comparison still
  // lands, computed on top of the first's result, rather than being dropped or racing it.
  const rankedDishesRef = useRef<RankedDish[]>([]);
  const rankedFoodsRef = useRef<RankedFood[]>([]);
  const chooseQueueRef = useRef(Promise.resolve());

  const refresh = useCallback(() => {
    (async () => {
      const entries: LogEntry[] = await logStorage.getAllEntries();
      const seen = new Set<string>();
      const dishes: Dish[] = [];
      for (const entry of entries) {
        if (entry.source.type !== "umass-menu") continue;
        const dish = { dishName: entry.source.dishName, hallTid: entry.source.hallTid };
        const key = dishKey(dish);
        if (seen.has(key)) continue;
        seen.add(key);
        dishes.push(dish);
      }
      const ranked = await rankingStorage.getRankedDishes();
      const rankedFoodsResult = await rankingStorage.getRankedFoods();
      rankedDishesRef.current = ranked;
      rankedFoodsRef.current = rankedFoodsResult;
      setLoggedDishes(dishes);
      setRankedDishes(ranked);
      setRankedFoods(rankedFoodsResult);
      const next = pickPair(dishes, ranked, lastPairRef.current);
      lastPairRef.current = next;
      setPair(next);
    })();
  }, []);

  useFocusEffect(refresh);

  async function choose(winner: Dish, loser: Dish) {
    // Chained onto the queue synchronously (before any await) so two taps fired back-to-back run
    // this body one after the other, never concurrently.
    chooseQueueRef.current = chooseQueueRef.current.then(async () => {
      const updated = applyComparison(rankedDishesRef.current, winner, loser);
      const updatedFoods = applyFoodComparison(rankedFoodsRef.current, winner, loser);
      rankedDishesRef.current = updated;
      rankedFoodsRef.current = updatedFoods;
      setRankedDishes(updated);
      setRankedFoods(updatedFoods);
      await rankingStorage.saveRankedDishes(updated);
      await rankingStorage.saveRankedFoods(updatedFoods);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        // Fire-and-forget: don't block advancing to the next pair on the network round-trip.
        // syncDiningHallRanks catches and logs its own failures, so nothing to .catch() here.
        void syncDiningHallRanks(supabase, session.user.id, updated);
      }

      const next = pickPair(loggedDishes, updated, lastPairRef.current);
      lastPairRef.current = next;
      setPair(next);
      // A rejection here must not leave the queue permanently wedged (every later tap chains onto
      // this same promise) -- caught, not re-thrown, matching the pre-#147 behavior of an
      // uncaught-but-non-fatal rejection from an un-awaited choose() call.
    }).catch((e) => console.error("choose: comparison failed", e));
    await chooseQueueRef.current;
  }

  function skip() {
    const next = pickPair(loggedDishes, rankedDishes, lastPairRef.current);
    lastPairRef.current = next;
    setPair(next);
  }

  const hallRanking = rankDiningHalls(rankedDishes);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.pageTitle}>Rank Dishes</Text>
      <View style={styles.rule} />
      <Text style={styles.hint}>Compare dishes you've actually logged — ranking is built from what you've eaten, not the full menu.</Text>

      {loggedDishes.length < 2 ? (
        <Text style={styles.hint}>Log a couple of meals first, then come back here to rank them.</Text>
      ) : pair ? (
        <Card style={styles.compareCard}>
          <Text style={styles.heading}>Which did you like more?</Text>
          <Button variant="primary" style={styles.choiceButton} onPress={() => choose(pair[0], pair[1])}>
            {`${pair[0].dishName} (${hallNameFor(pair[0].hallTid)})`}
          </Button>
          <Button variant="primary" style={styles.choiceButton} onPress={() => choose(pair[1], pair[0])}>
            {`${pair[1].dishName} (${hallNameFor(pair[1].hallTid)})`}
          </Button>
          <Button variant="ghost" onPress={skip}>
            Skip
          </Button>
        </Card>
      ) : null}

      <Text style={styles.heading}>Your ranking</Text>
      {rankedDishes.length === 0 ? (
        <Text style={styles.hint}>No comparisons yet.</Text>
      ) : (
        rankDishes(rankedDishes).map((dish, i) => (
          <Text key={dishKey(dish)} style={styles.rankRow}>
            {i + 1}. {dish.dishName} ({hallNameFor(dish.hallTid)}) — {Math.round(dish.rating)}
          </Text>
        ))
      )}

      <Text style={styles.heading}>Favorite Foods</Text>
      <Text style={styles.hint}>Your favorite dishes by name, regardless of which hall serves them.</Text>
      {rankedFoods.length === 0 ? (
        <Text style={styles.hint}>No comparisons yet.</Text>
      ) : (
        rankFoods(rankedFoods).map((food, i) => (
          <Text key={food.dishName} style={styles.rankRow}>
            {i + 1}. {food.dishName} — {Math.round(food.rating)}
          </Text>
        ))
      )}

      <Text style={styles.heading}>Dining hall ranking</Text>
      {hallRanking.ranked.map((hall) => (
        <Text key={hall.hallTid} style={styles.rankRow}>
          {hall.rank}. {hallNameFor(hall.hallTid)}
        </Text>
      ))}
      {hallRanking.unranked.map((hall) => (
        <Text key={hall.hallTid} style={styles.rankRowMuted}>
          {hallNameFor(hall.hallTid)} — not enough data yet
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream100 },
  container: { padding: spacing(4), paddingBottom: spacing(10) },
  pageTitle: { fontFamily: fonts.display, fontSize: 24, fontWeight: "700", textTransform: "uppercase", color: colors.maroon900 },
  rule: { marginTop: spacing(2), marginBottom: spacing(3), height: 0, borderTopWidth: 4, borderBottomWidth: 1, borderColor: colors.gold500 },
  hint: { fontFamily: fonts.body, color: withOpacity(colors.ink900, 65), marginBottom: spacing(3) },
  heading: {
    fontFamily: fonts.display,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.maroon900,
    marginTop: spacing(5),
    marginBottom: spacing(2),
  },
  compareCard: { padding: spacing(4), gap: spacing(2) },
  choiceButton: { marginBottom: spacing(0) },
  rankRow: { fontFamily: fonts.body, fontSize: 14, color: colors.ink900, paddingVertical: spacing(1) },
  rankRowMuted: { fontFamily: fonts.body, fontSize: 14, color: withOpacity(colors.ink900, 50), paddingVertical: spacing(1) },
});
