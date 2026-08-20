import type { HallCompletion } from "@udine/shared";
import type { LogEntry, RankedDish, RankedFood } from "@udine/shared";
import { buildTopFoods, deriveTopFoodHall, displayCompletionPct, pillTone } from "./youPaneFormat";

function completion(overrides: Partial<HallCompletion> = {}): HallCompletion {
  return { hallTid: 1, loggedDistinct: 0, seenDistinct: 0, pct: 0, ...overrides };
}

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

// --- displayCompletionPct: carry-over note 3 (pct rounds half-up in shared, e.g. 199/200 -> 100%
// via Math.round) — the pane must never claim "100%" unless every seen dish is logged. ------------

describe("displayCompletionPct", () => {
  it("is 0 when nothing's been seen", () => {
    expect(displayCompletionPct(completion({ loggedDistinct: 0, seenDistinct: 0 }))).toBe(0);
  });

  it("floors a partial completion instead of rounding", () => {
    // 199/200 = 99.5% — shared's Math.round pct would show "100%"; the pane must floor to 99.
    expect(displayCompletionPct(completion({ loggedDistinct: 199, seenDistinct: 200 }))).toBe(99);
  });

  it("only shows 100 when every seen dish is actually logged", () => {
    expect(displayCompletionPct(completion({ loggedDistinct: 200, seenDistinct: 200 }))).toBe(100);
  });
});

// --- pillTone: gold for the top score, maroon otherwise (canvas spec); ties all get gold. ---------

describe("pillTone", () => {
  it("gives the top score gold", () => {
    expect(pillTone(7.2, 7.2)).toBe("gold");
  });

  it("gives every non-top score maroon", () => {
    expect(pillTone(5.1, 7.2)).toBe("maroon");
  });

  it("gives gold to every food tied for the top score", () => {
    expect(pillTone(7.2, 7.2)).toBe("gold");
    expect(pillTone(7.2, 7.2)).toBe("gold");
  });
});

// --- deriveTopFoodHall: carry-over note 4 — RankedFood is cross-hall by name; derive a hall label
// presentationally (highest-rated RankedDish with that name, else the most recent log's hall). ----

describe("deriveTopFoodHall", () => {
  it("picks the highest-rated hall serving that dish name", () => {
    const dishes = [dish("Chicken Parm", 1, 1500), dish("Chicken Parm", 2, 1650)];
    expect(deriveTopFoodHall("Chicken Parm", dishes, [])).toBe(2);
  });

  it("falls back to the most recent log's hall when there's no RankedDish match", () => {
    const entries = [
      entry({ loggedAt: "2026-08-17T12:00:00.000Z", source: { type: "umass-menu", dishName: "Tofu Stir Fry", hallTid: 3 } }),
      entry({ loggedAt: "2026-08-18T12:00:00.000Z", source: { type: "umass-menu", dishName: "Tofu Stir Fry", hallTid: 4 } }),
    ];
    expect(deriveTopFoodHall("Tofu Stir Fry", [], entries)).toBe(4);
  });

  it("returns null when neither ranked dishes nor logs have a match", () => {
    expect(deriveTopFoodHall("Mystery Dish", [], [])).toBeNull();
  });
});

// --- buildTopFoods: the real "halls ranked, no food scores yet" in-between state (carry-over
// note 2) is rankedFoods present but every entry below scoreOutOfTen's 3-comparison gate. ---------

describe("buildTopFoods", () => {
  it("is empty when foods exist but none has enough comparisons for a score yet (the in-between state)", () => {
    const foods = [food("Chicken Parm", 1, 1520), food("Tofu Stir Fry", 2, 1480)];
    expect(buildTopFoods(foods, [], [])).toEqual([]);
  });

  it("scores, ranks, and hall-labels qualifying foods, gold only on the top score", () => {
    const foods = [food("Chicken Parm", 5, 1620), food("Tofu Stir Fry", 4, 1500)];
    const dishes = [dish("Chicken Parm", 1, 1620), dish("Tofu Stir Fry", 3, 1500)];
    const result = buildTopFoods(foods, dishes, []);
    expect(result.map((f) => f.dishName)).toEqual(["Chicken Parm", "Tofu Stir Fry"]);
    expect(result[0].tone).toBe("gold");
    expect(result[0].hallName).toBe("Worcester"); // hallTid 1
    expect(result[1].tone).toBe("maroon");
    expect(result[1].hallName).toBe("Hampshire"); // hallTid 3
  });

  it("caps the list at the given limit", () => {
    const foods = [
      food("A", 3, 1700),
      food("B", 3, 1650),
      food("C", 3, 1600),
    ];
    expect(buildTopFoods(foods, [], [], 2)).toHaveLength(2);
  });
});
