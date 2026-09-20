import type { RankedDish } from "@udine/shared";

export type Dish = { dishName: string; hallTid: number };

export function dishKey(d: Dish): string {
  return `${d.dishName}::${d.hallTid}`;
}

function comparisonCountFor(d: Dish, rankedDishes: RankedDish[]): number {
  return rankedDishes.find((r) => dishKey(r) === dishKey(d))?.comparisonCount ?? 0;
}

// Sample a couple of candidates and keep the least-compared one, instead of pure uniform
// random, so under-compared dishes surface more often.
export function pickLeastCompared(pool: Dish[], rankedDishes: RankedDish[]): Dish {
  let best = pool[Math.floor(Math.random() * pool.length)];
  for (let i = 0; i < 2; i++) {
    const candidate = pool[Math.floor(Math.random() * pool.length)];
    if (comparisonCountFor(candidate, rankedDishes) < comparisonCountFor(best, rankedDishes)) best = candidate;
  }
  return best;
}

export function samePair(p: [Dish, Dish], other: [Dish, Dish]): boolean {
  const [a, b] = [dishKey(p[0]), dishKey(p[1])];
  const [x, y] = [dishKey(other[0]), dishKey(other[1])];
  return (a === x && b === y) || (a === y && b === x);
}

export function pickPair(loggedDishes: Dish[], rankedDishes: RankedDish[], exclude: [Dish, Dish] | null): [Dish, Dish] | null {
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
