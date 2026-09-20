import type { RankedDish } from "@udine/shared";
import { dishKey, pickPair, samePair, type Dish } from "./pairSelection";

function dish(dishName: string, hallTid: number): Dish {
  return { dishName, hallTid };
}

function ranked(dishes: [Dish, number][]): RankedDish[] {
  return dishes.map(([d, comparisonCount]) => ({
    dishName: d.dishName,
    hallTid: d.hallTid,
    rating: 1000,
    comparisonCount,
  }));
}

describe("samePair", () => {
  it("treats a pair as the same regardless of order", () => {
    const a = dish("Pizza", 1);
    const b = dish("Salad", 2);
    expect(samePair([a, b], [b, a])).toBe(true);
    expect(samePair([a, b], [a, b])).toBe(true);
  });

  it("treats different dishes as different pairs", () => {
    const a = dish("Pizza", 1);
    const b = dish("Salad", 2);
    const c = dish("Soup", 3);
    expect(samePair([a, b], [a, c])).toBe(false);
  });
});

describe("pickPair", () => {
  it("returns null when fewer than 2 logged dishes exist", () => {
    expect(pickPair([], [], null)).toBeNull();
    expect(pickPair([dish("Pizza", 1)], [], null)).toBeNull();
  });

  it("always returns two distinct dishes from the logged pool", () => {
    const dishes = [dish("Pizza", 1), dish("Salad", 2), dish("Soup", 3)];
    for (let i = 0; i < 50; i++) {
      const pair = pickPair(dishes, [], null);
      expect(pair).not.toBeNull();
      const [a, b] = pair!;
      expect(dishKey(a)).not.toBe(dishKey(b));
      expect(dishes.some((d) => dishKey(d) === dishKey(a))).toBe(true);
      expect(dishes.some((d) => dishKey(d) === dishKey(b))).toBe(true);
    }
  });

  it("avoids repeating the immediately-excluded pair when other pairs exist", () => {
    const dishes = [dish("Pizza", 1), dish("Salad", 2), dish("Soup", 3)];
    const excluded: [Dish, Dish] = [dishes[0], dishes[1]];
    for (let i = 0; i < 50; i++) {
      const pair = pickPair(dishes, [], excluded);
      expect(pair).not.toBeNull();
      expect(samePair(pair!, excluded)).toBe(false);
    }
  });

  it("biases toward the least-compared dish", () => {
    // Pizza has been compared far more than Salad or Soup, so across many draws it should
    // show up in the returned pair less often than either of the under-compared dishes.
    const dishes = [dish("Pizza", 1), dish("Salad", 2), dish("Soup", 3)];
    const rankedDishes = ranked([
      [dishes[0], 100],
      [dishes[1], 0],
      [dishes[2], 0],
    ]);

    let pizzaCount = 0;
    const trials = 500;
    for (let i = 0; i < trials; i++) {
      const pair = pickPair(dishes, rankedDishes, null)!;
      if (pair.some((d) => dishKey(d) === dishKey(dishes[0]))) pizzaCount++;
    }

    // Uniform random pair selection from 3 items would put Pizza in ~2/3 of pairs. The
    // least-compared bias should pull this well below that.
    expect(pizzaCount / trials).toBeLessThan(0.4);
  });
});
