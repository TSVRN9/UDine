import type { HallCompletion } from "@udine/shared";
import type { LogEntry, RankedDish, RankedFood } from "@udine/shared";
import { buildTopFoods, deriveTopFoodHall, displayCompletionPct, groupEntriesByMeal, logItemLine, mealPeriodForTime, pillTone } from "./youPaneFormat";

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

// --- mealPeriodForTime / groupEntriesByMeal (#118): canonical, contiguous local-clock windows
// covering the full 24h day (breakfast 5:00-10:30, lunch 10:30-14:00, dinner 14:00-21:00, late
// night 21:00-5:00 wrapping past midnight) -- since the windows are contiguous with no gaps,
// every entry has exactly one enclosing period by construction (issue #118's "nearest/enclosing"
// ask). TZ is pinned to America/New_York for the whole suite (mobile/package.json's `test` script
// -- see date.test.ts's own comment on why that has to be a process-start env var, not a
// per-test one). ------------------------------------------------------------------------------

describe("mealPeriodForTime", () => {
  it("buckets the breakfast start boundary (5:00 AM) to breakfast, inclusive", () => {
    expect(mealPeriodForTime("2026-08-20T05:00:00.000")).toBe("breakfast");
  });

  it("buckets one minute before the breakfast boundary to late night (still last night's window)", () => {
    expect(mealPeriodForTime("2026-08-20T04:59:00.000")).toBe("latenight");
  });

  it("buckets the lunch start boundary (10:30 AM) to lunch, and one minute before to breakfast", () => {
    expect(mealPeriodForTime("2026-08-20T10:30:00.000")).toBe("lunch");
    expect(mealPeriodForTime("2026-08-20T10:29:00.000")).toBe("breakfast");
  });

  it("buckets the dinner start boundary (2:00 PM) to dinner, and one minute before to lunch", () => {
    expect(mealPeriodForTime("2026-08-20T14:00:00.000")).toBe("dinner");
    expect(mealPeriodForTime("2026-08-20T13:59:00.000")).toBe("lunch");
  });

  it("buckets the late-night start boundary (9:00 PM) to late night, and one minute before to dinner", () => {
    expect(mealPeriodForTime("2026-08-20T21:00:00.000")).toBe("latenight");
    expect(mealPeriodForTime("2026-08-20T20:59:00.000")).toBe("dinner");
  });

  it("crosses midnight: both 11:30 PM and 12:30 AM bucket to late night", () => {
    expect(mealPeriodForTime("2026-08-20T23:30:00.000")).toBe("latenight");
    expect(mealPeriodForTime("2026-08-21T00:30:00.000")).toBe("latenight");
  });

  it("reads the LOCAL hour, not the UTC hour, for a Z-suffixed timestamp (issue #111's trap)", () => {
    // 2026-08-20T14:00:00.000Z is 2:00 PM UTC == 10:00 AM Eastern (EDT, UTC-4 in August) --
    // "breakfast" is the only correct answer. A bug that read getUTCHours() instead of getHours()
    // would see UTC hour 14 and wrongly bucket this as "dinner" (dinner's own 2:00 PM boundary).
    expect(mealPeriodForTime("2026-08-20T14:00:00.000Z")).toBe("breakfast");
  });
});

// --- logItemLine: extracted out of YouPane.tsx (was module-local there) so #119's Logs & stats
// screen can reuse the exact same collapsed-row text instead of re-deriving it. Its hall-name
// lookup is @udine/shared's hallNameFor (#108) -- see umassDining.test.ts for that contract's own
// coverage (known tid, unknown-tid fallback, Grab 'N Go tid resolution). ---------------------------

describe("logItemLine", () => {
  it("omits the × qty suffix for a single serving", () => {
    const e = entry({ servings: 1, source: { type: "umass-menu", dishName: "French Toast", hallTid: 3 } });
    expect(logItemLine(e)).toBe("French Toast · Hampshire");
  });

  it("includes the × qty suffix for multiple servings", () => {
    const e = entry({ servings: 2, source: { type: "umass-menu", dishName: "French Toast", hallTid: 3 } });
    expect(logItemLine(e)).toBe("French Toast × 2 · Hampshire");
  });

  it("omits the hall for an off-menu (barcode) entry", () => {
    const e = entry({ servings: 1, source: { type: "off", barcode: "0123", productName: "Trail Mix" } });
    expect(logItemLine(e)).toBe("Trail Mix");
  });
});

function mealEntry(id: string, loggedAt: string, calories: number, servings = 1): LogEntry {
  return { id, loggedAt, source: { type: "umass-menu", dishName: id, hallTid: 1 }, servings, nutrition: { ...NUTRITION_FIXTURE, calories } };
}

const NUTRITION_FIXTURE = {
  servingSize: "1 serving",
  calories: 0,
  caloriesFromFat: 0,
  totalFatG: 0,
  satFatG: 0,
  transFatG: 0,
  cholesterolMg: 0,
  sodiumMg: 0,
  totalCarbG: 0,
  dietaryFiberG: 0,
  sugarsG: 0,
  proteinG: 0,
};

describe("groupEntriesByMeal", () => {
  it("returns no groups for an empty entry list", () => {
    expect(groupEntriesByMeal([])).toEqual([]);
  });

  it("groups entries by meal period, only including periods that have entries", () => {
    const entries = [
      mealEntry("breakfast-1", "2026-08-20T07:00:00.000", 300),
      mealEntry("dinner-1", "2026-08-20T18:00:00.000", 700),
    ];
    const groups = groupEntriesByMeal(entries);
    expect(groups.map((g) => g.period)).toEqual(["breakfast", "dinner"]);
    expect(groups.map((g) => g.label)).toEqual(["Breakfast", "Dinner"]);
  });

  it("orders groups canonically (Breakfast, Lunch, Dinner, Late Night) regardless of input order", () => {
    const entries = [
      mealEntry("late-1", "2026-08-20T22:00:00.000", 200),
      mealEntry("lunch-1", "2026-08-20T12:00:00.000", 200),
      mealEntry("breakfast-1", "2026-08-20T07:00:00.000", 200),
      mealEntry("dinner-1", "2026-08-20T18:00:00.000", 200),
    ];
    expect(groupEntriesByMeal(entries).map((g) => g.period)).toEqual(["breakfast", "lunch", "dinner", "latenight"]);
  });

  it("sums each group's total calories as calories * servings, reconciling with computeDailyTotals", () => {
    const entries = [
      mealEntry("a", "2026-08-20T07:00:00.000", 400, 1),
      mealEntry("b", "2026-08-20T08:00:00.000", 120, 2), // 240
    ];
    const [breakfast] = groupEntriesByMeal(entries);
    expect(breakfast.totalCalories).toBe(640); // 400 + 120*2, matches the canvas's "640 cal" example
  });

  it("preserves each group's entries in their given (chronological) order", () => {
    const entries = [
      mealEntry("first", "2026-08-20T07:00:00.000", 100),
      mealEntry("second", "2026-08-20T09:00:00.000", 100),
    ];
    const [breakfast] = groupEntriesByMeal(entries);
    expect(breakfast.entries.map((e) => e.id)).toEqual(["first", "second"]);
  });

  it("groups a pre-5AM entry into Late Night alongside a same-day evening entry (cross-midnight, review nit 4)", () => {
    // 12:30 AM and 10:00 PM on the same calendar day -- both Late Night by mealPeriodForTime's
    // wrap, and both land on THIS day's Today's Log (the caller's isoDateOf/todayIso filter decides
    // which day's card an entry appears on; groupEntriesByMeal only decides which meal bucket
    // within that card -- see the doc comment above MEAL_BOUNDARIES).
    const entries = [
      mealEntry("late-night-early", "2026-08-20T00:30:00.000", 150),
      mealEntry("late-night-evening", "2026-08-20T22:00:00.000", 150),
    ];
    const groups = groupEntriesByMeal(entries);
    expect(groups.map((g) => g.period)).toEqual(["latenight"]);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["late-night-early", "late-night-evening"]);
    expect(groups[0].totalCalories).toBe(300);
  });

  it("sums a group's PER-ENTRY rounded calories, not the group's raw total rounded once (reachable via fractional-calorie OpenFoodFacts entries)", () => {
    // Two 50.5-cal entries in the SAME group -- UMass menu calories are always whole numbers, but
    // OpenFoodFacts-sourced "off" entries aren't (e.g. energy-kcal_serving: 50.5). Round-each-then-
    // sum (what this function does) gives round(50.5) + round(50.5) = 51 + 51 = 102. The naive
    // alternative -- sum the raw floats once, then round -- gives Math.round(50.5 + 50.5) =
    // Math.round(101.0) = 101, a real 1-calorie disagreement. This is what makes summing every
    // group's totalCalories always reconcile with an entrywise-rounded day total (issue #118's
    // "group subtotals must agree with the day totals" ask): integer addition of already-rounded
    // per-entry values is exactly associative, however entries are split into groups.
    const entries = [
      mealEntry("a", "2026-08-20T07:00:00.000", 50.5),
      mealEntry("b", "2026-08-20T07:30:00.000", 50.5),
    ];
    const [breakfast] = groupEntriesByMeal(entries);
    expect(breakfast.totalCalories).toBe(102);
    expect(breakfast.totalCalories).not.toBe(Math.round(50.5 + 50.5)); // the naive round-once total (101)
  });

  it("reconciles exactly with the sum of ALL entries' rounded calories, even split across DIFFERENT groups", () => {
    const entries = [
      mealEntry("breakfast-1", "2026-08-20T07:00:00.000", 100.5),
      mealEntry("dinner-1", "2026-08-20T18:00:00.000", 100.5),
    ];
    const groups = groupEntriesByMeal(entries);
    const displayedTotal = groups.reduce((sum, g) => sum + g.totalCalories, 0);
    expect(displayedTotal).toBe(202); // round(100.5) + round(100.5), same as YouPane's stat card sum
  });
});
