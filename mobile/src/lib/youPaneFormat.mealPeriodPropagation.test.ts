// #144: youPaneFormat.ts's groupEntriesByMeal used to derive group ORDER and LABELS from its own
// hardcoded MEAL_ORDER array / MEAL_LABELS record, independent of shared's MEAL_PERIODS/
// mealPeriodLabel. Now both are sourced from shared directly. This mocks shared's order and label
// function to prove that wiring, not just re-assert the real (identical-looking) values.
//
// NOTE: which periods can appear at ALL is still gated by youPaneFormat.ts's own MEAL_BOUNDARIES
// table (PR #128's fixed local-clock windows) -- deliberately NOT consolidated onto shared, see
// that table's own doc comment. A hypothetical new shared period can't be exercised here the way
// hallMenuTabs.mealPeriodPropagation.test.ts does, because mealPeriodForTime would never bucket an
// entry into it without a window added to MEAL_BOUNDARIES too. This test instead proves the part
// that *is* consolidated: the four existing periods' display order and labels.
jest.mock("@udine/shared", () => {
  const actual = jest.requireActual("@udine/shared");
  return {
    ...actual,
    // Spread into a new array before .reverse() -- .reverse() mutates in place, and actual.MEAL_PERIODS
    // is shared's real, live-imported array; reversing it directly would corrupt it for every other
    // module in this test run, not just this mock. Result: real order reversed -- latenight, dinner, lunch, breakfast.
    MEAL_PERIODS: [...actual.MEAL_PERIODS].reverse(),
    mealPeriodLabel: (period: string) => `Custom ${period}`,
  };
});

import type { LogEntry } from "@udine/shared";
import { groupEntriesByMeal } from "./youPaneFormat";

function mealEntry(id: string, loggedAt: string): LogEntry {
  return {
    id,
    loggedAt,
    source: { type: "umass-menu", dishName: id, hallTid: 1 },
    servings: 1,
    nutrition: {
      servingSize: "1 serving",
      calories: 100,
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
    },
  };
}

describe("groupEntriesByMeal order/labels propagate from shared, not a hardcoded copy (#144)", () => {
  it("orders groups by (mocked) shared MEAL_PERIODS order and labels via (mocked) shared mealPeriodLabel", () => {
    const entries = [
      mealEntry("b", "2026-08-20T06:00:00.000"), // falls in the breakfast window (MEAL_BOUNDARIES, unaffected by the mock)
      mealEntry("l", "2026-08-20T11:00:00.000"), // lunch window
      mealEntry("d", "2026-08-20T15:00:00.000"), // dinner window
      mealEntry("n", "2026-08-20T22:00:00.000"), // latenight window
    ];

    const groups = groupEntriesByMeal(entries);

    // A hardcoded MEAL_ORDER copy would still yield the real canonical order here, ignoring the mock.
    expect(groups.map((g) => g.period)).toEqual(["latenight", "dinner", "lunch", "breakfast"]);
    // A hardcoded MEAL_LABELS record would still yield the real labels, ignoring the mocked mealPeriodLabel.
    expect(groups.map((g) => g.label)).toEqual(["Custom latenight", "Custom dinner", "Custom lunch", "Custom breakfast"]);
  });
});
