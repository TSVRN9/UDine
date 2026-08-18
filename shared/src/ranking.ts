import { DINING_HALLS } from "./umassDining.ts";
import type { RankedDish } from "./types.ts";

const DEFAULT_RATING = 1500;

const MAX_K = 32;
const MIN_K = 8;
const K_DECAY = 10;

/**
 * Provisional K-factor: high (matching the old fixed 32) for a dish's first few comparisons, then
 * tapering toward a floor as comparisonCount grows so an established dish's rating stabilizes
 * instead of swinging as hard as a brand-new dish's. Exported so other Elo-update code (e.g. the
 * Favorite Food cross-hall track, see docs/adr/0001-two-elo-tracks-for-dish-ranking.md) can reuse
 * the same taper instead of duplicating it.
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
 * Applies one pairwise comparison (winner preferred over loser) using an Elo update, the same
 * incremental rating math chess uses to turn win/loss outcomes into a total order without requiring
 * every item to be compared against every other. Beli-style ranking apps use the same idea. Returns a
 * new array — winner/loser are updated (or created, if this is either dish's first rating), everything
 * else is unchanged.
 */
export function applyComparison(dishes: RankedDish[], winner: { dishName: string; hallTid: number }, loser: { dishName: string; hallTid: number }): RankedDish[] {
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

/** Highest-rated dishes first. */
export function rankDishes(dishes: RankedDish[]): RankedDish[] {
  return [...dishes].sort((a, b) => b.rating - a.rating);
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
  const byHall = new Map<number, number[]>();
  for (const dish of dishes) {
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
