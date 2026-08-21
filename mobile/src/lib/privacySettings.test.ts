import type { LogEntry, RankedDish, RankedFood } from "@udine/shared";
import { deriveSharedStatsPayloads, fieldsNeedingRefresh, sharedStatValueForToggle } from "./privacySettings";

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: "1",
    loggedAt: "2026-08-17T12:00:00.000Z",
    source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 },
    servings: 1,
    nutrition: {
      servingSize: "1 serving",
      calories: 100,
      caloriesFromFat: 10,
      totalFatG: 5,
      satFatG: 1,
      transFatG: 0,
      cholesterolMg: 0,
      sodiumMg: 0,
      totalCarbG: 10,
      dietaryFiberG: 1,
      sugarsG: 1,
      proteinG: 20,
    },
    ...overrides,
  };
}

function food(dishName: string, comparisonCount: number, rating: number): RankedFood {
  return { dishName, comparisonCount, rating };
}

function dish(dishName: string, hallTid: number, rating: number): RankedDish {
  return { dishName, hallTid, rating, comparisonCount: 3 };
}

describe("deriveSharedStatsPayloads", () => {
  it("carries completion as hallTid/loggedDistinct/seenDistinct only -- no shared-computed pct", () => {
    const seenByHall = new Map([[1, ["Chicken", "Salad"]]]);
    const entries = [entry({ source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 } })];
    const { completion } = deriveSharedStatsPayloads(seenByHall, entries, [], []);

    const hall1 = completion.find((c) => c.hallTid === 1);
    expect(hall1).toEqual({ hallTid: 1, loggedDistinct: 1, seenDistinct: 2 });
    expect(hall1).not.toHaveProperty("pct");
  });

  it("carries top foods as dishName/score/hallName only -- no tone, no comparisonCount", () => {
    const foods = [food("Chicken Parm", 5, 1620)];
    const dishes = [dish("Chicken Parm", 1, 1620)];
    const { topFoods } = deriveSharedStatsPayloads(new Map(), [], dishes, foods);

    expect(topFoods).toEqual([{ dishName: "Chicken Parm", score: expect.any(Number), hallName: "Worcester" }]);
    expect(topFoods[0]).not.toHaveProperty("tone");
    expect(topFoods[0]).not.toHaveProperty("comparisonCount");
  });

  it("caps top foods at the same 5-item limit YouPane shows the owner", () => {
    const foods = Array.from({ length: 8 }, (_, i) => food(`Dish ${i}`, 3, 1500 + i));
    const dishes = foods.map((f, i) => dish(f.dishName, 1, 1500 + i));
    const { topFoods } = deriveSharedStatsPayloads(new Map(), [], dishes, foods);
    expect(topFoods).toHaveLength(5);
  });

  it("carries the full ranked hall order verbatim", () => {
    // rankDiningHalls requires >=2 rated dishes per hall to produce a ranked (not "unranked") entry.
    const dishes = [dish("A1", 1, 1400), dish("A2", 1, 1400), dish("B1", 2, 1600), dish("B2", 2, 1600)];
    const { hallRanks } = deriveSharedStatsPayloads(new Map(), [], dishes, []);
    expect(hallRanks).toEqual([
      { hallTid: 2, rank: 1 },
      { hallTid: 1, rank: 2 },
    ]);
  });
});

describe("sharedStatValueForToggle", () => {
  const derived = {
    completion: [{ hallTid: 1, loggedDistinct: 3, seenDistinct: 10 }],
    topFoods: [{ dishName: "Pizza", score: 8.8, hallName: "Berkshire" }],
    hallRanks: [{ hallTid: 1, rank: 1 }],
  };

  it("returns null on toggle-off, regardless of field -- a revoke, not the current value", () => {
    expect(sharedStatValueForToggle("completion", false, derived)).toBeNull();
    expect(sharedStatValueForToggle("top_foods", false, derived)).toBeNull();
    expect(sharedStatValueForToggle("hall_ranks", false, derived)).toBeNull();
  });

  it("returns exactly that field's current derived value on toggle-on, not another field's", () => {
    expect(sharedStatValueForToggle("completion", true, derived)).toBe(derived.completion);
    expect(sharedStatValueForToggle("top_foods", true, derived)).toBe(derived.topFoods);
    expect(sharedStatValueForToggle("hall_ranks", true, derived)).toBe(derived.hallRanks);
  });
});

describe("fieldsNeedingRefresh", () => {
  it("is empty when there's no existing row at all -- nothing was ever opted in", () => {
    expect(fieldsNeedingRefresh(null)).toEqual([]);
  });

  it("is empty when every field is null -- a row exists but nothing is opted in", () => {
    expect(fieldsNeedingRefresh({ completion: null, top_foods: null, hall_ranks: null })).toEqual([]);
  });

  it("lists only the non-null fields -- a plain refresh never opts a new field in", () => {
    expect(fieldsNeedingRefresh({ completion: [{ hallTid: 1 }], top_foods: null, hall_ranks: [{ hallTid: 1, rank: 1 }] })).toEqual(["completion", "hall_ranks"]);
  });
});
