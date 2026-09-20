import {
  applyComparison,
  applyFoodComparison,
  pickPostLogComparisonPair,
  scoreOutOfTen,
  type FoodRankingStorage,
  type LogEntry,
  type LoggedDish,
  type RankedDish,
  type RankedFood,
  type RankingStorage,
} from "@udine/shared";

// Module-level, not per-storage: SqliteRankingStorage is stateless and every caller shares the one
// preferences_kv blob, so two overlapping read-modify-write cycles would clobber each other anyway.
let inFlight = false;

/**
 * One pick: both Elo tracks, both saves. Returns null (records nothing) if another pick is still
 * saving, so a double tap can't count twice. Reads storage fresh each time, so callers hold no
 * ranking state that can go stale.
 */
export async function recordComparison(
  storage: RankingStorage & FoodRankingStorage,
  winner: LoggedDish,
  loser: LoggedDish,
): Promise<{ dishes: RankedDish[]; foods: RankedFood[] } | null> {
  if (inFlight) return null;
  inFlight = true;
  try {
    const dishes = applyComparison(await storage.getRankedDishes(), winner, loser);
    const foods = applyFoodComparison(await storage.getRankedFoods(), winner, loser);
    await storage.saveRankedDishes(dishes);
    await storage.saveRankedFoods(foods);
    return { dishes, foods };
  } finally {
    inFlight = false;
  }
}

/**
 * "Rate them" pair: the plate dish with the fewest comparisons against the least-compared dish
 * logged before this plate. Null when there is no past dish to pair with.
 */
export function pickPostLogPair(entriesBefore: LogEntry[], plate: LoggedDish[], rankedDishes: RankedDish[]): [LoggedDish, LoggedDish] | null {
  const count = (d: LoggedDish) => rankedDishes.find((r) => r.dishName === d.dishName && r.hallTid === d.hallTid)?.comparisonCount ?? 0;
  const justLogged = plate.reduce<LoggedDish | null>((least, d) => (least === null || count(d) < count(least) ? d : least), null);
  return justLogged && pickPostLogComparisonPair(entriesBefore, justLogged, rankedDishes);
}

/** "9.1 · 15 comparisons", or just "2 comparisons" while scoreOutOfTen withholds the score. */
export function comparisonSubLine(food: RankedFood): string {
  const n = `${food.comparisonCount} comparison${food.comparisonCount === 1 ? "" : "s"}`;
  const score = scoreOutOfTen([food]).get(food.dishName);
  return score === undefined ? n : `${score.toFixed(1)} · ${n}`;
}
