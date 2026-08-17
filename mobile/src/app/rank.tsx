import { applyComparison, DINING_HALLS, favoriteDiningHalls, rankDishes, type LogEntry, type RankedDish } from "@udine/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SqliteLogStorage } from "../lib/sqliteStorage";
import { SqliteRankingStorage } from "../lib/rankingStorage";
import { supabase } from "../lib/supabase";
import { syncFavoriteHalls } from "../lib/syncFavoriteHalls";

type Dish = { dishName: string; hallTid: number };

const logStorage = new SqliteLogStorage();
const rankingStorage = new SqliteRankingStorage();

function hallName(hallTid: number): string {
  return DINING_HALLS.find((h) => h.tid === hallTid)?.name ?? `Hall ${hallTid}`;
}

function dishKey(d: Dish): string {
  return `${d.dishName}::${d.hallTid}`;
}

function pickPair(loggedDishes: Dish[]): [Dish, Dish] | null {
  if (loggedDishes.length < 2) return null;
  const a = loggedDishes[Math.floor(Math.random() * loggedDishes.length)];
  let b = a;
  while (dishKey(b) === dishKey(a)) {
    b = loggedDishes[Math.floor(Math.random() * loggedDishes.length)];
  }
  return [a, b];
}

export default function RankScreen() {
  const [loggedDishes, setLoggedDishes] = useState<Dish[]>([]);
  const [rankedDishes, setRankedDishes] = useState<RankedDish[]>([]);
  const [pair, setPair] = useState<[Dish, Dish] | null>(null);

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
      setLoggedDishes(dishes);
      setRankedDishes(ranked);
      setPair(pickPair(dishes));
    })();
  }, []);

  useFocusEffect(refresh);

  async function choose(winner: Dish, loser: Dish) {
    const updated = applyComparison(rankedDishes, winner, loser);
    setRankedDishes(updated);
    await rankingStorage.saveRankedDishes(updated);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      await syncFavoriteHalls(supabase, session.user.id, updated);
    }

    setPair(pickPair(loggedDishes));
  }

  function skip() {
    setPair(pickPair(loggedDishes));
  }

  const favorites = favoriteDiningHalls(rankedDishes);

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

      <Text style={styles.heading}>Favorite dining halls</Text>
      {favorites.length === 0 ? (
        <Text>Not enough ranked dishes per hall yet.</Text>
      ) : (
        favorites.map((fav) => (
          <Text key={fav.hallTid} style={styles.rankRow}>
            {fav.rank}. {hallName(fav.hallTid)}
          </Text>
        ))
      )}
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
