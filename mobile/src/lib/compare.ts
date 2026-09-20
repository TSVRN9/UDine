import {
  applyComparison,
  applyFoodComparison,
  distinctLoggedDishes,
  pickPostLogComparisonPair,
  scoreOutOfTen,
  type FoodRankingStorage,
  type LogEntry,
  type LoggedDish,
  type RankedDish,
  type RankedFood,
  type RankingStorage,
} from "@udine/shared";
import type { PlateEntry } from "./plate";
import { pickPair, samePair, type Dish } from "./pairSelection";

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
    // ponytail: two separate preferences_kv writes, so a throw on the second leaves the tracks diverged; upgrade to one transaction if storage grows a batch save.
    await storage.saveRankedDishes(dishes);
    await storage.saveRankedFoods(foods);
    return { dishes, foods };
  } finally {
    inFlight = false;
  }
}

/** The plate's rankable dishes: UMass menu items only (a custom or packaged item has no dish identity), one per dish however many servings. */
export function plateDishes(plate: PlateEntry[]): LoggedDish[] {
  return plate.flatMap((p) => (p.source.type === "umass-menu" ? [{ dishName: p.source.dishName, hallTid: p.source.hallTid }] : []));
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

/** What a compare card shows: the dish, and its per-serving calories from the latest time it was logged. */
export type CompareCard = LoggedDish & { calories: number };

export function compareCard(entries: LogEntry[], dish: LoggedDish): CompareCard {
  let latest: LogEntry | undefined;
  for (const e of entries) {
    if (e.source.type !== "umass-menu" || e.source.dishName !== dish.dishName || e.source.hallTid !== dish.hallTid) continue;
    if (!latest || e.loggedAt > latest.loggedAt) latest = e;
  }
  return { dishName: dish.dishName, hallTid: dish.hallTid, calories: Math.round(latest?.nutrition.calories ?? 0) };
}

/**
 * A fresh pair among everything logged (the archived `pickPair`: least-compared first). Null with fewer than two distinct dishes, or
 * when the only pair there is is `exclude` -- `pickPair` itself only avoids the excluded pair with 3+ dishes and would re-deal it forever with two.
 */
export function dealPair(entries: LogEntry[], rankedDishes: RankedDish[], exclude: [Dish, Dish] | null): [CompareCard, CompareCard] | null {
  const pair = pickPair(distinctLoggedDishes(entries), rankedDishes, exclude);
  if (!pair || (exclude && samePair(pair, exclude))) return null;
  return [compareCard(entries, pair[0]), compareCard(entries, pair[1])];
}

/**
 * Dev-only `--stress compare-pair` (screenshot.sh): two logged dishes and an in-memory ranking store,
 * so the sheet and the after-pick toast screenshot without seeding or touching the device's real log
 * or rankings. French Toast is seeded at 14 comparisons so one pick lands on "N · 15 comparisons".
 */
export function compareFixture(rated = true) {
  const entry = (dishName: string, hallTid: number, calories: number) =>
    ({ id: `fixture-${dishName}`, loggedAt: "2026-01-01T12:00:00.000", source: { type: "umass-menu", dishName, hallTid }, servings: 1, nutrition: { calories } }) as unknown as LogEntry;
  let dishes: RankedDish[] = [];
  let foods: RankedFood[] = rated
    ? [
        { dishName: "French Toast", rating: 1908, comparisonCount: 14 },
        { dishName: "Belgian Waffle", rating: 1500, comparisonCount: 14 },
      ]
    : [];
  const storage: RankingStorage & FoodRankingStorage = {
    getRankedDishes: async () => dishes,
    saveRankedDishes: async (d) => {
      dishes = d;
    },
    getRankedFoods: async () => foods,
    saveRankedFoods: async (f) => {
      foods = f;
    },
  };
  // A third dish, never shown first, so "Another" has a pair to offer (CompareToastPicked.dc.html).
  const entries = [entry("French Toast", 3, 320), entry("Belgian Waffle", 4, 410), entry("Scrambled Eggs", 2, 180)];
  // A fixed order, not dealPair's random draw, so screenshots line up with CompareSheet.dc.html.
  const pair: [CompareCard, CompareCard] = [compareCard(entries, entries[0].source as LoggedDish), compareCard(entries, entries[1].source as LoggedDish)];
  return { entries, pair, storage };
}

/**
 * What a pick leads to, for every surface that hosts the sheet: the save, the toast text (the winner
 * and its "9.1 · 15 comparisons"), and the next pair to offer ("Another"; null when there is none).
 * Null when another pick is still saving -- drop the tap.
 */
export async function resolvePick(storage: RankingStorage & FoodRankingStorage, entries: LogEntry[], winner: CompareCard, loser: CompareCard) {
  const saved = await recordComparison(storage, winner, loser);
  if (!saved) return null;
  const food = saved.foods.find((f) => f.dishName === winner.dishName);
  return { ...saved, message: winner.dishName, subline: food ? comparisonSubLine(food) : undefined, next: dealPair(entries, saved.dishes, [winner, loser]) };
}

/** Skip: the next pair to show, or null when there is nothing else to deal (the caller closes the sheet). Records nothing. */
export async function resolveSkip(storage: RankingStorage, entries: LogEntry[], shown: [Dish, Dish] | null) {
  return dealPair(entries, await storage.getRankedDishes(), shown);
}

/** "9.1 · 15 comparisons", or just "2 comparisons" while scoreOutOfTen withholds the score. */
export function comparisonSubLine(food: RankedFood): string {
  const n = `${food.comparisonCount} comparison${food.comparisonCount === 1 ? "" : "s"}`;
  const score = scoreOutOfTen([food]).get(food.dishName);
  return score === undefined ? n : `${score.toFixed(1)} · ${n}`;
}
