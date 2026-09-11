import { DINING_HALLS } from "./umassDining.ts";
import type { LogEntry, RankedDish, RankedFood } from "./types.ts";

/** Starting Elo rating for a dish/food's first comparison. Exported so other rating-derived code
 * (e.g. scores.ts's 0-10 display mapping) can anchor to the same baseline instead of duplicating
 * the magic number. */
export const DEFAULT_RATING = 1500;

const MAX_K = 32;
const MIN_K = 8;
const K_DECAY = 10;

/**
 * Provisional K-factor: high for a dish's first few comparisons, then tapering toward a floor as
 * comparisonCount grows so an established dish's rating stabilizes instead of swinging as hard as
 * a brand-new dish's. Exported so other Elo-update code (the Favorite Food cross-hall track, see
 * docs/adr/0001-two-elo-tracks-for-dish-ranking.md) can reuse the same taper.
 */
export function kFactorFor(comparisonCount: number): number {
  return Math.max(MIN_K, MAX_K / (1 + Math.max(0, comparisonCount) / K_DECAY));
}

function dishKey(dishName: string, hallTid: number): string {
  return `${dishName}::${hallTid}`;
}

function findOrCreate(dishes: RankedDish[], dishName: string, hallTid: number): RankedDish {
  return dishes.find((d) => d.dishName === dishName && d.hallTid === hallTid) ?? { dishName, hallTid, rating: DEFAULT_RATING, comparisonCount: 0 };
}

/**
 * Applies one pairwise comparison (winner preferred over loser) using an Elo update. Returns a new
 * array — winner/loser are updated (or created, if this is either dish's first rating), everything
 * else is unchanged.
 *
 * Mirrors applyFoodComparison's guard: when winner and loser share the same (dishName, hallTid) key
 * there's nothing meaningful to compare, so the array is returned unchanged rather than duplicating
 * the dish's row.
 */
export function applyComparison(dishes: RankedDish[], winner: { dishName: string; hallTid: number }, loser: { dishName: string; hallTid: number }): RankedDish[] {
  if (winner.dishName === loser.dishName && winner.hallTid === loser.hallTid) return dishes;

  const winnerDish = findOrCreate(dishes, winner.dishName, winner.hallTid);
  const loserDish = findOrCreate(dishes, loser.dishName, loser.hallTid);

  const expectedWinner = 1 / (1 + 10 ** ((loserDish.rating - winnerDish.rating) / 400));
  const expectedLoser = 1 - expectedWinner;

  const updatedWinner: RankedDish = {
    ...winnerDish,
    rating: winnerDish.rating + kFactorFor(winnerDish.comparisonCount) * (1 - expectedWinner),
    comparisonCount: winnerDish.comparisonCount + 1,
  };
  const updatedLoser: RankedDish = {
    ...loserDish,
    rating: loserDish.rating + kFactorFor(loserDish.comparisonCount) * (0 - expectedLoser),
    comparisonCount: loserDish.comparisonCount + 1,
  };

  const winnerKey = dishKey(winner.dishName, winner.hallTid);
  const loserKey = dishKey(loser.dishName, loser.hallTid);
  const rest = dishes.filter((d) => dishKey(d.dishName, d.hallTid) !== winnerKey && dishKey(d.dishName, d.hallTid) !== loserKey);
  return [...rest, updatedWinner, updatedLoser];
}

export function rankDishes(dishes: RankedDish[]): RankedDish[] {
  return [...dishes].sort((a, b) => b.rating - a.rating);
}

function findOrCreateFood(foods: RankedFood[], dishName: string): RankedFood {
  return foods.find((f) => f.dishName === dishName) ?? { dishName, rating: DEFAULT_RATING, comparisonCount: 0 };
}

/**
 * The cross-hall "Favorite Food" Elo track — see docs/adr/0001-two-elo-tracks-for-dish-ranking.md.
 * Same Elo math and kFactorFor taper as applyComparison, except when winner and loser share a
 * dishName (the underlying comparison was the same dish at two different halls): there's nothing
 * meaningful to compare, so it's returned unchanged — the per-hall applyComparison call still
 * updates RankedDish regardless.
 */
export function applyFoodComparison(foods: RankedFood[], winner: { dishName: string }, loser: { dishName: string }): RankedFood[] {
  if (winner.dishName === loser.dishName) return foods;

  const winnerFood = findOrCreateFood(foods, winner.dishName);
  const loserFood = findOrCreateFood(foods, loser.dishName);

  const expectedWinner = 1 / (1 + 10 ** ((loserFood.rating - winnerFood.rating) / 400));
  const expectedLoser = 1 - expectedWinner;

  const updatedWinner: RankedFood = {
    ...winnerFood,
    rating: winnerFood.rating + kFactorFor(winnerFood.comparisonCount) * (1 - expectedWinner),
    comparisonCount: winnerFood.comparisonCount + 1,
  };
  const updatedLoser: RankedFood = {
    ...loserFood,
    rating: loserFood.rating + kFactorFor(loserFood.comparisonCount) * (0 - expectedLoser),
    comparisonCount: loserFood.comparisonCount + 1,
  };

  const rest = foods.filter((f) => f.dishName !== winner.dishName && f.dishName !== loser.dishName);
  return [...rest, updatedWinner, updatedLoser];
}

export function rankFoods(foods: RankedFood[]): RankedFood[] {
  return [...foods].sort((a, b) => b.rating - a.rating);
}

// ponytail: plain average rating per hall, no confidence weighting for halls with only 1-2 rated
// dishes — a single high/low outlier can swing a hall's average. Upgrade to a weighted/Bayesian
// average (blend toward the overall mean until comparisonCount is high enough) if favorite-hall
// results feel noisy in practice.
const MIN_RATED_DISHES_PER_HALL = 2;

export interface DiningHallRank {
  hallTid: number;
  /** 1-based position, 1 = highest average rating. Matches the `rank` column in the `favorite_dining_halls` table (supabase/migrations) — write this value directly, don't re-derive an index. */
  rank: number;
}

/**
 * The full ordering of all 4 dining halls by average dish rating (CONTEXT.md glossary: "Dining Hall
 * Ranking"). Always accounts for all 4 halls — those with enough rated dishes come back ranked,
 * highest average first; the rest come back unranked rather than omitted. Only `ranked` is coarse
 * enough to sync to the server (see RankingStorage doc comment) — an unranked hall has no real signal.
 */
export function rankDiningHalls(dishes: RankedDish[]): { ranked: DiningHallRank[]; unranked: { hallTid: number }[] } {
  // Only the 4 DINING_HALLS are ever ranked/unranked here -- a RankedDish's hallTid can be anything
  // a screen fed it (e.g. a Grab 'N Go location's own tid), but `ranked` is synced to the server as
  // a "favorite dining hall" and every downstream consumer assumes the tid maps to one of the 4
  // halls. Filter here, once, rather than at every caller that builds a RankedDish[].
  const hallTids = new Set(DINING_HALLS.map((h) => h.tid));
  const byHall = new Map<number, number[]>();
  for (const dish of dishes) {
    if (!hallTids.has(dish.hallTid)) continue;
    const ratings = byHall.get(dish.hallTid) ?? [];
    ratings.push(dish.rating);
    byHall.set(dish.hallTid, ratings);
  }

  const averages = [...byHall.entries()]
    .filter(([, ratings]) => ratings.length >= MIN_RATED_DISHES_PER_HALL)
    .map(([hallTid, ratings]) => ({ hallTid, average: ratings.reduce((a, b) => a + b, 0) / ratings.length }));
  averages.sort((a, b) => b.average - a.average);

  const ranked = averages.map((a, i) => ({ hallTid: a.hallTid, rank: i + 1 }));
  const rankedIds = new Set(ranked.map((r) => r.hallTid));
  const unranked = DINING_HALLS.filter((h) => !rankedIds.has(h.tid)).map((h) => ({ hallTid: h.tid }));

  return { ranked, unranked };
}

// --- rank-informed surfaces (post-log comparison prompt) ---------------------------------------

/** A logged dish's identity — same (dishName, hallTid) pairing RankedDish uses, without the rating. */
export interface LoggedDish {
  dishName: string;
  hallTid: number;
}

function loggedDishKey(d: LoggedDish): string {
  return dishKey(d.dishName, d.hallTid);
}

/**
 * Extracts the distinct umass-menu dishes a user has logged, in first-seen order (barcode/`off`
 * entries excluded, repeats of the same dish+hall collapsed to one).
 */
export function distinctLoggedDishes(entries: LogEntry[]): LoggedDish[] {
  const seen = new Set<string>();
  const dishes: LoggedDish[] = [];
  for (const entry of entries) {
    if (entry.source.type !== "umass-menu") continue;
    const dish = { dishName: entry.source.dishName, hallTid: entry.source.hallTid };
    const key = loggedDishKey(dish);
    if (seen.has(key)) continue;
    seen.add(key);
    dishes.push(dish);
  }
  return dishes;
}

/**
 * Decides whether to offer a one-tap comparison prompt right after logging `justLogged`, and if so,
 * which other previously-logged dish to pair it against. Reuses applyComparison's dish identity
 * (dishName+hallTid) and RankedDish's comparisonCount to prefer under-compared dishes, the same
 * signal /rank's own pair-picker uses.
 *
 * Returns null when there's no valid opponent: `justLogged` is the only distinct dish logged so
 * far. Deterministic (always the least-compared opponent) rather than randomized like /rank's
 * sampler — a post-log prompt fires once per log, so there's no staleness to guard against.
 */
export function pickPostLogComparisonPair(
  entries: LogEntry[],
  justLogged: LoggedDish,
  rankedDishes: RankedDish[],
): [LoggedDish, LoggedDish] | null {
  const justLoggedKey = loggedDishKey(justLogged);
  const candidates = distinctLoggedDishes(entries).filter((d) => loggedDishKey(d) !== justLoggedKey);
  if (candidates.length === 0) return null;

  const comparisonCountFor = (d: LoggedDish): number =>
    rankedDishes.find((r) => loggedDishKey(r) === loggedDishKey(d))?.comparisonCount ?? 0;

  const opponent = candidates.reduce((least, d) => (comparisonCountFor(d) < comparisonCountFor(least) ? d : least));
  return [justLogged, opponent];
}
