import * as fs from "fs";
import * as path from "path";
import type { LogEntry, RankedDish, RankedFood, RankingStorage, FoodRankingStorage } from "@udine/shared";
import { comparisonSubLine, compareCard, dealPair, pickPostLogPair, plateDishes, recordComparison } from "./compare";
import type { PlateEntry } from "./plate";

type Storage = RankingStorage & FoodRankingStorage;

function stubStorage(dishes: RankedDish[] = [], foods: RankedFood[] = []) {
  const saveRankedDishes = jest.fn(async (d: RankedDish[]) => {
    dishes = d;
  });
  const saveRankedFoods = jest.fn(async (f: RankedFood[]) => {
    foods = f;
  });
  const storage: Storage = {
    getRankedDishes: async () => dishes,
    getRankedFoods: async () => foods,
    saveRankedDishes,
    saveRankedFoods,
  };
  return { storage, saveRankedDishes, saveRankedFoods };
}

const pizza = { dishName: "Pizza", hallTid: 1 };
const salad = { dishName: "Salad", hallTid: 2 };

describe("recordComparison", () => {
  it("updates both Elo tracks and saves each exactly once", async () => {
    const { storage, saveRankedDishes, saveRankedFoods } = stubStorage();
    const result = await recordComparison(storage, pizza, salad);
    expect(saveRankedDishes).toHaveBeenCalledTimes(1);
    expect(saveRankedFoods).toHaveBeenCalledTimes(1);
    for (const track of [result!.dishes, result!.foods]) {
      const w = track.find((r) => r.dishName === "Pizza")!;
      const l = track.find((r) => r.dishName === "Salad")!;
      expect(w.comparisonCount).toBe(1);
      expect(l.comparisonCount).toBe(1);
      expect(w.rating).toBeGreaterThan(l.rating);
    }
  });

  it("drops a second call made before the first finishes (no double count)", async () => {
    const { storage, saveRankedDishes, saveRankedFoods } = stubStorage();
    const [first, second] = await Promise.all([recordComparison(storage, pizza, salad), recordComparison(storage, pizza, salad)]);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(saveRankedDishes).toHaveBeenCalledTimes(1);
    expect(saveRankedFoods).toHaveBeenCalledTimes(1);
  });

  it("accepts the next pick once the first has finished, and after a failed save", async () => {
    const { storage, saveRankedDishes } = stubStorage();
    saveRankedDishes.mockRejectedValueOnce(new Error("disk"));
    await expect(recordComparison(storage, pizza, salad)).rejects.toThrow("disk");
    await expect(recordComparison(storage, pizza, salad)).resolves.not.toBeNull();
  });
});

function entry(dishName: string, hallTid: number): LogEntry {
  return { source: { type: "umass-menu", dishName, hallTid } } as unknown as LogEntry;
}

describe("pickPostLogPair", () => {
  const ranked: RankedDish[] = [{ ...pizza, rating: 1000, comparisonCount: 4 }];

  it("pairs the least-compared plate dish with the least-compared past dish", () => {
    const pair = pickPostLogPair([entry("Pizza", 1), entry("Soup", 3)], [pizza, salad], ranked);
    expect(pair).toEqual([salad, { dishName: "Soup", hallTid: 3 }]);
  });

  it("never pairs a plate dish against itself and returns null with no past dish", () => {
    expect(pickPostLogPair([], [pizza, salad], ranked)).toBeNull();
    expect(pickPostLogPair([entry("Pizza", 1)], [pizza], ranked)).toBeNull();
  });
});

describe("compareCard", () => {
  const logged = (dishName: string, hallTid: number, loggedAt: string, calories: number): LogEntry =>
    ({ loggedAt, source: { type: "umass-menu", dishName, hallTid }, servings: 2, nutrition: { calories } }) as unknown as LogEntry;

  it("carries the dish's identity and its per-serving calories from the latest matching entry", () => {
    const entries = [logged("Pizza", 1, "2026-09-02T12:00:00", 300), logged("Pizza", 1, "2026-09-03T12:00:00", 320.4), logged("Pizza", 2, "2026-09-04T12:00:00", 999)];
    // servings: 2 must not double it; the other hall's Pizza must not leak in; the newer entry wins.
    expect(compareCard(entries, pizza)).toEqual({ dishName: "Pizza", hallTid: 1, calories: 320 });
    expect(compareCard([...entries].reverse(), pizza).calories).toBe(320);
  });

  it("falls back to 0 calories when the dish isn't in the entries", () => {
    expect(compareCard([], pizza)).toEqual({ dishName: "Pizza", hallTid: 1, calories: 0 });
  });
});

describe("dealPair", () => {
  const logged = (dishName: string, hallTid: number): LogEntry =>
    ({ loggedAt: "2026-09-02T12:00:00", source: { type: "umass-menu", dishName, hallTid }, servings: 1, nutrition: { calories: 100 } }) as unknown as LogEntry;
  const soup = { dishName: "Soup", hallTid: 3 };
  const names = (p: [{ dishName: string }, { dishName: string }] | null) => p && p.map((d) => d.dishName).sort();

  it("deals the two dishes when only two are logged and nothing is excluded", () => {
    expect(names(dealPair([logged("Pizza", 1), logged("Soup", 3)], [], null))).toEqual(["Pizza", "Soup"]);
  });

  it("returns null when the only pair there is, in either order, is the excluded one", () => {
    const entries = [logged("Pizza", 1), logged("Soup", 3)];
    expect(dealPair(entries, [], [pizza, soup])).toBeNull();
    expect(dealPair(entries, [], [soup, pizza])).toBeNull();
  });

  it("returns null with fewer than two distinct dishes", () => {
    expect(dealPair([logged("Pizza", 1), logged("Pizza", 1)], [], null)).toBeNull();
    expect(dealPair([], [], null)).toBeNull();
  });

  it("with three dishes never repeats the excluded pair, and each card carries its calories", () => {
    const entries = [logged("Pizza", 1), logged("Soup", 3), logged("Salad", 2)];
    for (let i = 0; i < 200; i++) {
      const p = dealPair(entries, [], [pizza, soup])!;
      expect(names(p)).not.toEqual(["Pizza", "Soup"]);
      expect(p.every((c) => c.calories === 100)).toBe(true);
    }
  });
});

describe("plateDishes", () => {
  const plateEntry = (source: LogEntry["source"], count = 1) => ({ key: "k", label: "x", nutrition: {}, source, count }) as unknown as PlateEntry;

  it("keeps only UMass menu dishes (a custom or packaged item can't be ranked), one per dish, whatever the serving count", () => {
    const plate = [
      plateEntry({ type: "umass-menu", dishName: "Pizza", hallTid: 1 }, 2),
      plateEntry({ type: "custom", customFoodId: "c1", productName: "Mom's stew" }),
      plateEntry({ type: "off", barcode: "123", productName: "Bar" }),
      plateEntry({ type: "umass-menu", dishName: "Salad", hallTid: 2 }),
    ];
    expect(plateDishes(plate)).toEqual([pizza, salad]);
    expect(plateDishes([plateEntry({ type: "custom", customFoodId: "c1", productName: "Stew" })])).toEqual([]);
  });
});

describe("comparisonSubLine", () => {
  const food = (comparisonCount: number, rating = 1000): RankedFood => ({ dishName: "Pizza", rating, comparisonCount });

  it("shows score and count once the score gate is passed", () => {
    expect(comparisonSubLine(food(15))).toMatch(/^\d+\.\d · 15 comparisons$/);
  });

  it("shows only the count below the gate", () => {
    expect(comparisonSubLine(food(2))).toBe("2 comparisons");
    expect(comparisonSubLine(food(1))).toBe("1 comparison");
  });
});

describe("residency", () => {
  it("compare.ts imports nothing that syncs off-device", () => {
    const src = fs.readFileSync(path.join(__dirname, "compare.ts"), "utf8");
    expect(src).not.toMatch(/syncDiningHallRanks|supabase/);
  });
});
