// #144: mobile had three hardcoded meal-period arrays that could silently diverge from shared's
// RAW_MEAL_PERIOD_KEYS -- the same defect class that dropped "latenight" from web's hall page in
// #137 before #141 fixed it there. This guards hallMenuTabs.ts's MEAL_TABS/mealTabLabel, now
// consolidated onto shared's MEAL_PERIODS/mealPeriodLabel: mocks a hypothetical 5th period into
// shared and checks it actually reaches these consumers, instead of a hardcoded copy silently
// dropping it. Separate file (not added to hallMenuTabs.test.ts) so this mock doesn't leak into
// that file's other, unrelated assertions -- jest.mock is hoisted and applies to the whole module.
import type { MealPeriod } from "@udine/shared";

jest.mock("@udine/shared", () => {
  const actual = jest.requireActual("@udine/shared");
  return { ...actual, MEAL_PERIODS: [...actual.MEAL_PERIODS, "brunch"] };
});

import { MEAL_TABS, mealTabLabel } from "./hallMenuTabs";

describe("hallMenuTabs consumers propagate a new shared meal period (#144)", () => {
  it("MEAL_TABS includes a period added to shared's MEAL_PERIODS instead of a fixed 4-entry copy", () => {
    expect((MEAL_TABS as readonly string[]).includes("brunch")).toBe(true);
  });

  it("mealTabLabel delegates unrecognized periods to shared's mealPeriodLabel title-casing", () => {
    expect(mealTabLabel("brunch" as MealPeriod)).toBe("Brunch");
  });

  it("mealTabLabel still applies mobile's compact override for latenight", () => {
    expect(mealTabLabel("latenight")).toBe("Late");
  });
});
