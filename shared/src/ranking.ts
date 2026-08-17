import type { RankedDish } from "./types.ts";

const DEFAULT_RATING = 1500;
const K_FACTOR = 32;

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
    rating: winnerDish.rating + K_FACTOR * (1 - expectedWinner),
    comparisonCount: winnerDish.comparisonCount + 1,
  };
  const updatedLoser: RankedDish = {
    ...loserDish,
    rating: loserDish.rating + K_FACTOR * (0 - expectedLoser),
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

/** Dining halls with the highest average dish rating, highest first — the only ranking-derived signal allowed to sync to the server (see RankingStorage doc comment). */
export function favoriteDiningHalls(dishes: RankedDish[], topN = 3): number[] {
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
  return averages.slice(0, topN).map((a) => a.hallTid);
}
