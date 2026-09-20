import * as fs from "fs";
import * as path from "path";
import type { LogEntry, RankedDish, RankedFood, RankingStorage, FoodRankingStorage } from "@udine/shared";
import { comparisonSubLine, pickPostLogPair, recordComparison } from "./compare";

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
