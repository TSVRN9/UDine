import type { FoodPreferences, MenuItem } from "@udine/shared";
import { dishRowKey, grabSections, moveSectionToFront, sectionsForPeriod, type MenuSection } from "./hallMenuSections";

const NO_PREFS: FoodPreferences = { allergensToAvoid: [], requiredDietTags: [] };

function nutrition(calories: number): MenuItem["nutrition"] {
  return {
    servingSize: "1 each",
    calories,
    caloriesFromFat: 0,
    totalFatG: 1,
    satFatG: 0,
    transFatG: 0,
    cholesterolMg: 0,
    sodiumMg: 0,
    totalCarbG: 1,
    dietaryFiberG: 0,
    sugarsG: 0,
    proteinG: 1,
  };
}

const PIZZA: MenuItem = {
  dishName: "Pizza",
  category: "Entrees",
  mealPeriod: "lunch",
  hallTid: 1,
  date: "2026-08-19",
  nutrition: nutrition(200),
  allergens: [],
  dietTags: [],
};

const SALAD: MenuItem = {
  dishName: "Salad",
  category: "Entrees",
  mealPeriod: "lunch",
  hallTid: 1,
  date: "2026-08-19",
  nutrition: nutrition(80),
  allergens: [],
  dietTags: ["Halal", "Gluten-Free"],
};

const OATMEAL: MenuItem = {
  dishName: "Oatmeal",
  category: "Breakfast Entrees",
  mealPeriod: "breakfast",
  hallTid: 1,
  date: "2026-08-19",
  nutrition: nutrition(150),
  allergens: [],
  dietTags: [],
};

describe("sectionsForPeriod", () => {
  it("filters to the given meal period, grouped by station", () => {
    expect(sectionsForPeriod([PIZZA, OATMEAL, SALAD], "lunch", NO_PREFS)).toEqual([{ title: "Entrees", data: [PIZZA, SALAD] }]);
  });

  it("returns one section per distinct category, in sortStationNames' fixed order, not first-seen", () => {
    const soup = { ...PIZZA, dishName: "Soup", category: "Soups" };
    // Soup is first in the input array, but Entrees sorts before Soups in the station order.
    expect(sectionsForPeriod([soup, PIZZA], "lunch", NO_PREFS).map((s) => s.title)).toEqual(["Entrees", "Soups"]);
  });

  it("excludes items from other meal periods", () => {
    expect(sectionsForPeriod([PIZZA, OATMEAL], "breakfast", NO_PREFS)).toEqual([{ title: "Breakfast Entrees", data: [OATMEAL] }]);
  });

  it("drops items that don't match food preferences", () => {
    const prefs: FoodPreferences = { allergensToAvoid: [], requiredDietTags: ["Halal"] };
    expect(sectionsForPeriod([PIZZA, SALAD], "lunch", prefs)).toEqual([{ title: "Entrees", data: [SALAD] }]);
  });

  it("returns no sections for an empty item list", () => {
    expect(sectionsForPeriod([], "lunch", NO_PREFS)).toEqual([]);
  });

  // Same real trailing-whitespace fixture grabSections' own "trims category whitespace" test
  // uses -- sectionsForPeriod used to leave the raw, untrimmed category in place, so two feed
  // entries for the same station differing only in trailing whitespace rendered as two duplicate
  // section headers instead of merging into one.
  it("trims category whitespace, merging entries that differ only by it into one section", () => {
    const untrimmed = { ...PIZZA, category: "Entrees " };
    const trimmed = { ...SALAD, category: "Entrees" };
    expect(sectionsForPeriod([untrimmed, trimmed], "lunch", NO_PREFS)).toEqual([
      { title: "Entrees", data: [untrimmed, trimmed] },
    ]);
  });
});

describe("grabSections", () => {
  // Ported from hallMenu.test.tsx's live-capture regression: the same dish can come back twice
  // under two different mealPeriod values sharing one trimmed category (Grab's items carry
  // ordinary breakfast/lunch/etc. tags with no filtering by any of them) -- must dedup to one row.
  it("dedups the same dish appearing under two mealPeriod values sharing one trimmed category", () => {
    const grabWrapLunch = { ...PIZZA, dishName: "Grab Wrap", category: "Grab n'Go Hot ", mealPeriod: "lunch" as const };
    const grabWrapBreakfast = { ...PIZZA, dishName: "Grab Wrap", category: "Grab n'Go Hot ", mealPeriod: "breakfast" as const };
    expect(grabSections([grabWrapLunch, grabWrapBreakfast], NO_PREFS)).toEqual([{ title: "Grab n'Go Hot", data: [grabWrapLunch] }]);
  });

  it("trims category whitespace for the section title", () => {
    const item = { ...PIZZA, category: "Entrees  " };
    expect(grabSections([item], NO_PREFS)[0].title).toBe("Entrees");
  });

  it("drops items that don't match food preferences", () => {
    const prefs: FoodPreferences = { allergensToAvoid: [], requiredDietTags: ["Halal"] };
    expect(grabSections([PIZZA, SALAD], prefs)).toEqual([{ title: "Entrees", data: [SALAD] }]);
  });

  it("returns no sections for an empty item list", () => {
    expect(grabSections([], NO_PREFS)).toEqual([]);
  });

  it("orders its sections with sortStationNames, not first-seen order", () => {
    const soup = { ...PIZZA, dishName: "Soup", category: "Soups" };
    expect(grabSections([soup, PIZZA], NO_PREFS).map((s) => s.title)).toEqual(["Entrees", "Soups"]);
  });
});

describe("dishRowKey", () => {
  // Regression: confirmed live 2026-09-14 -- Hampshire's real daily feed independently served a
  // "Pizza" station with the same 3 dishes (same category, dish names, and position) the
  // always-available tail station (alwaysAvailableStations.ts) also renders. Both used to compute
  // the identical key, which React Native logs as a duplicate-key warning.
  it("gives a real feed item and a same-named always-available item distinct keys", () => {
    const realFeedPizza: MenuItem = { ...PIZZA, category: "Pizza", dishName: "Cheese Pizza", date: "2026-09-14" };
    const alwaysAvailablePizza: MenuItem = { ...PIZZA, category: "Pizza", dishName: "Cheese Pizza", date: "" };
    expect(dishRowKey(realFeedPizza, 0)).not.toBe(dishRowKey(alwaysAvailablePizza, 0));
  });

  it("includes category, dish name, date, and index", () => {
    expect(dishRowKey(PIZZA, 2)).toBe(`${PIZZA.category}-${PIZZA.dishName}-${PIZZA.date}-2`);
  });
});

describe("moveSectionToFront", () => {
  // #452: sortStationNames sorts an unrecognized category (e.g. the dev-only "Stress Test" fixture
  // section) alphabetically AFTER every real station -- confirmed live 2026-09-12 that this left
  // the fixture off the initial viewport, unreachable without a long scroll, across two separate
  // investigations that both assumed (per a since-corrected stale comment in [slug].tsx) it would
  // be prepended automatically. This is the fix: pull the named section back to the front.
  const A: MenuSection = { title: "Grill", data: [] };
  const B: MenuSection = { title: "Salad", data: [] };
  const STRESS: MenuSection = { title: "Stress Test", data: [] };

  it("moves a section from the back to the front", () => {
    expect(moveSectionToFront([A, B, STRESS], "Stress Test")).toEqual([STRESS, A, B]);
  });

  it("is a no-op when the section is already first", () => {
    expect(moveSectionToFront([STRESS, A, B], "Stress Test")).toEqual([STRESS, A, B]);
  });

  it("is a no-op when the section isn't present at all", () => {
    expect(moveSectionToFront([A, B], "Stress Test")).toEqual([A, B]);
  });
});
