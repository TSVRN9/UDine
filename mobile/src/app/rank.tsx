import {
  applyComparison,
  applyFoodComparison,
  DINING_HALLS,
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
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SqliteLogStorage } from "../lib/sqliteStorage";
import { SqliteRankingStorage } from "../lib/rankingStorage";
import { supabase } from "../lib/supabase";

type Dish = { dishName: string; hallTid: number };

const logStorage = new SqliteLogStorage();
const rankingStorage = new SqliteRankingStorage();

function hallName(hallTid: number): string {
  return DINING_HALLS.find((h) => h.tid === hallTid)?.name ?? `Hall ${hallTid}`;
}

function dishKey(d: Dish): string {
  return `${d.dishName}::${d.hallTid}`;
}

function comparisonCountFor(d: Dish, rankedDishes: RankedDish[]): number {
  return rankedDishes.find((r) => dishKey(r) === dishKey(d))?.comparisonCount ?? 0;
}

// Sample a couple of candidates and keep the least-compared one, instead of pure uniform
// random, so under-compared dishes surface more often.
function pickLeastCompared(pool: Dish[], rankedDishes: RankedDish[]): Dish {
  let best = pool[Math.floor(Math.random() * pool.length)];
  for (let i = 0; i < 2; i++) {
    const candidate = pool[Math.floor(Math.random() * pool.length)];
    if (comparisonCountFor(candidate, rankedDishes) < comparisonCountFor(best, rankedDishes)) best = candidate;
  }
  return best;
}

function samePair(p: [Dish, Dish], other: [Dish, Dish]): boolean {
  const [a, b] = [dishKey(p[0]), dishKey(p[1])];
  const [x, y] = [dishKey(other[0]), dishKey(other[1])];
  return (a === x && b === y) || (a === y && b === x);
}

function pickPair(loggedDishes: Dish[], rankedDishes: RankedDish[], exclude: [Dish, Dish] | null): [Dish, Dish] | null {
  if (loggedDishes.length < 2) return null;
  let candidate: [Dish, Dish];
  do {
    const a = pickLeastCompared(loggedDishes, rankedDishes);
    let b = a;
    while (dishKey(b) === dishKey(a)) {
      b = pickLeastCompared(loggedDishes, rankedDishes);
    }
    candidate = [a, b];
  } while (loggedDishes.length > 2 && exclude && samePair(candidate, exclude));
  return candidate;
}

export default function RankScreen() {
  const [loggedDishes, setLoggedDishes] = useState<Dish[]>([]);
  const [rankedDishes, setRankedDishes] = useState<RankedDish[]>([]);
  const [rankedFoods, setRankedFoods] = useState<RankedFood[]>([]);
  const [pair, setPair] = useState<[Dish, Dish] | null>(null);
  const lastPairRef = useRef<[Dish, Dish] | null>(null);

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
    const updated = applyComparison(rankedDishes, winner, loser);
    const updatedFoods = applyFoodComparison(rankedFoods, winner, loser);
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
  }

  function skip() {
    const next = pickPair(loggedDishes, rankedDishes, lastPairRef.current);
    lastPairRef.current = next;
    setPair(next);
  }

  const hallRanking = rankDiningHalls(rankedDishes);

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>Compare dishes you've actually logged — ranking is built from what you've eaten, not the full menu.</Text>

      {loggedDishes.length < 2 ? (
        <Text style={styles.hint}>Log a couple of meals first, then come back here to rank them.</Text>
      ) : pair ? (
        <View>
          <Text style={styles.heading}>Which did you like more?</Text>
          <Pressable style={styles.choiceButton} onPress={() => choose(pair[0], pair[1])}>
            <Text style={styles.choiceButtonText}>
              {pair[0].dishName} ({hallName(pair[0].hallTid)})
            </Text>
          </Pressable>
          <Pressable style={styles.choiceButton} onPress={() => choose(pair[1], pair[0])}>
            <Text style={styles.choiceButtonText}>
              {pair[1].dishName} ({hallName(pair[1].hallTid)})
            </Text>
          </Pressable>
          <Pressable onPress={skip}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.heading}>Your ranking</Text>
      {rankedDishes.length === 0 ? (
        <Text>No comparisons yet.</Text>
      ) : (
        rankDishes(rankedDishes).map((dish, i) => (
          <Text key={dishKey(dish)} style={styles.rankRow}>
            {i + 1}. {dish.dishName} ({hallName(dish.hallTid)}) — {Math.round(dish.rating)}
          </Text>
        ))
      )}

      <Text style={styles.heading}>Favorite Foods</Text>
      <Text style={styles.hint}>Your favorite dishes by name, regardless of which hall serves them.</Text>
      {rankedFoods.length === 0 ? (
        <Text>No comparisons yet.</Text>
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
          {hall.rank}. {hallName(hall.hallTid)}
        </Text>
      ))}
      {hallRanking.unranked.map((hall) => (
        <Text key={hall.hallTid} style={styles.rankRow}>
          {hallName(hall.hallTid)} — not enough data yet
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  hint: { color: "#555", marginBottom: 12 },
  heading: { fontSize: 18, fontWeight: "600", marginTop: 20, marginBottom: 8 },
  choiceButton: { backgroundColor: "#208AEF", borderRadius: 8, padding: 14, marginBottom: 8 },
  choiceButtonText: { color: "white", fontWeight: "600", textAlign: "center" },
  skip: { color: "#888", textAlign: "center", marginTop: 4 },
  rankRow: { paddingVertical: 4 },
});
