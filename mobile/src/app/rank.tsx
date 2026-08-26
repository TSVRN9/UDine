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
import { hallOrRetailName } from "../lib/retailHallNames";

const logStorage = new SqliteLogStorage();
const rankingStorage = new SqliteRankingStorage();

export default function RankScreen() {
  const [loggedDishes, setLoggedDishes] = useState<Dish[]>([]);
  const [rankedDishes, setRankedDishes] = useState<RankedDish[]>([]);
  const [rankedFoods, setRankedFoods] = useState<RankedFood[]>([]);
  const [pair, setPair] = useState<[Dish, Dish] | null>(null);
  const lastPairRef = useRef<[Dish, Dish] | null>(null);

  // #147: choose() reads/saves whole-blob rankedDishes/rankedFoods. The displayed pair doesn't
  // change until the LAST statement in choose() runs (after both awaited saves + getSession), so a
  // second tap landing inside that window is never a distinct judgement on a different pair -- it's
  // the same button re-tapped by accident, or the other button mis-tapped on a pair the user hasn't
  // seen change. Dropped, same call the repo already made for this exact stale-closure mechanism in
  // logs.tsx's withStepGuard ("two overlapping calls would both compute from the same stale
  // count... the second tap is dropped rather than mis-applied") and for LOG's own double-tap guard
  // (useGuardedLogPlate). These two refs stay regardless: `choosing.current` releases in `finally`
  // synchronously after `setPair`, before React commits the re-render, so a tap landing in that
  // sub-frame window would still see stale render-closure state without them -- they're the actual
  // source of truth for choose(), updated the moment a comparison applies rather than on next render.
  const rankedDishesRef = useRef<RankedDish[]>([]);
  const rankedFoodsRef = useRef<RankedFood[]>([]);
  const choosing = useRef(false);
  // #165: a rejected save used to propagate out of the un-awaited onPress as an unhandled promise
  // rejection (silent in release, a LogBox warning in dev). Caught in choose() below and surfaced
  // here instead -- this screen has no banner infra, so a small text line on the compare card is
  // the minimal feedback, cleared on the next attempt/success.
  const [chooseError, setChooseError] = useState<string | null>(null);

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
    // Checked synchronously before the first await -- a second tap landing before this one
    // finishes is dropped outright, not queued (see the refs' comment above for why).
    if (choosing.current) return;
    choosing.current = true;
    setChooseError(null);
    try {
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
    } catch (e) {
      // #165: surface instead of letting it vanish as an unhandled rejection out of onPress.
      // ponytail: both saveRankedDishes/saveRankedFoods calls already succeeded by the time
      // getSession() (or syncDiningHallRanks, if that were awaited) could reject, so this message
      // can fire *after* the comparison is already durably persisted -- "couldn't save" then
      // overstates it, and a re-tap on the still-displayed pair applies applyComparison a second
      // time on top of the already-updated refs (the exact double-count #147/#159 guard this
      // against for a same-tick double-tap, not a post-persist retry). Pre-existing shape (same
      // stuck-pair/re-tap risk existed when this was an unhandled rejection); narrowing the catch
      // to only the two save() calls would reopen the unhandled-rejection hole #165 closes, so
      // left as one broad catch. Split the save/session steps' error handling if this surfaces in
      // practice.
      setChooseError(`Couldn't save your choice: ${String(e)}`);
    } finally {
      choosing.current = false;
    }
  }

  function skip() {
    // #167 (PR #166 review nit): choose() clears chooseError on the next attempt, but skip() didn't
    // -- a stale "Couldn't save" message from a prior failed choose() would sit under the freshly
    // dealt pair with no failed action to explain it.
    setChooseError(null);
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
            {`${pair[0].dishName} (${hallOrRetailName(pair[0].hallTid)})`}
          </Button>
          <Button variant="primary" style={styles.choiceButton} onPress={() => choose(pair[1], pair[0])}>
            {`${pair[1].dishName} (${hallOrRetailName(pair[1].hallTid)})`}
          </Button>
          <Button variant="ghost" onPress={skip}>
            Skip
          </Button>
          {chooseError && <Text style={styles.chooseError}>{chooseError}</Text>}
        </Card>
      ) : null}

      <Text style={styles.heading}>Your ranking</Text>
      {rankedDishes.length === 0 ? (
        <Text style={styles.hint}>No comparisons yet.</Text>
      ) : (
        rankDishes(rankedDishes).map((dish, i) => (
          <Text key={dishKey(dish)} style={styles.rankRow}>
            {i + 1}. {dish.dishName} ({hallOrRetailName(dish.hallTid)}) — {Math.round(dish.rating)}
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
  chooseError: { fontFamily: fonts.body, fontSize: 13, color: colors.maroon600 },
  rankRow: { fontFamily: fonts.body, fontSize: 14, color: colors.ink900, paddingVertical: spacing(1) },
  rankRowMuted: { fontFamily: fonts.body, fontSize: 14, color: withOpacity(colors.ink900, 50), paddingVertical: spacing(1) },
});
