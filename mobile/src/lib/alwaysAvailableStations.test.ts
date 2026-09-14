import type { FoodPreferences, NutritionFacts } from "@udine/shared";
import { alwaysAvailableSections } from "./alwaysAvailableStations";
import { menuItemToPlateEntry } from "./plate";
import type { CachedDishCatalog } from "./dishCatalog";

const NO_PREFS: FoodPreferences = { allergensToAvoid: [], requiredDietTags: [] };

function nutrition(overrides: Partial<NutritionFacts> = {}): NutritionFacts {
  return {
    servingSize: "1 cup",
    calories: 10,
    caloriesFromFat: 0,
    totalFatG: 0,
    satFatG: 0,
    transFatG: 0,
    cholesterolMg: 0,
    sodiumMg: 5,
    totalCarbG: 2,
    dietaryFiberG: 1,
    sugarsG: 1,
    proteinG: 1,
    ...overrides,
  };
}

// Worcester (tid 1): real ALWAYS_AVAILABLE_STATIONS entries include "Lettuce" (Salad Bar)
// and "Cheese Pizza" (Pizza). Franklin (tid 2) has no Salad Bar station at all.
function catalogWith(entries: { dishName: string; nutrition: NutritionFacts; allergens?: string[]; dietTags?: string[] }[]): CachedDishCatalog {
  return {
    lastSyncedAt: "2026-09-14T00:00:00.000Z",
    entries: entries.map((e) => ({ dishName: e.dishName, nutrition: e.nutrition, allergens: e.allergens ?? [], dietTags: e.dietTags ?? [], updatedAt: "2026-09-14T00:00:00.000Z" })),
  };
}

describe("alwaysAvailableSections", () => {
  it("returns Salad Bar and Pizza sections for a hall that has both, in that order", () => {
    const catalog = catalogWith([
      { dishName: "Lettuce", nutrition: nutrition({ calories: 10 }) },
      { dishName: "Cheese Pizza", nutrition: nutrition({ calories: 285 }) },
    ]);
    const sections = alwaysAvailableSections(1, catalog, NO_PREFS, "lunch");
    expect(sections.map((s) => s.title)).toEqual(["Salad Bar", "Pizza"]);
    expect(sections[0].data.map((i) => i.dishName)).toContain("Lettuce");
    expect(sections[1].data.map((i) => i.dishName)).toContain("Cheese Pizza");
  });

  it("renders no block for a station the hall doesn't have (Franklin has no Salad Bar)", () => {
    const catalog = catalogWith([
      { dishName: "Cheese Pizza", nutrition: nutrition() },
      { dishName: "Pepperoni Pizza", nutrition: nutrition() },
    ]);
    const sections = alwaysAvailableSections(2, catalog, NO_PREFS, "lunch");
    expect(sections.map((s) => s.title)).toEqual(["Pizza"]);
  });

  it("renders no block at all for a hallTid with no curated stations", () => {
    const catalog = catalogWith([{ dishName: "Cheese Pizza", nutrition: nutrition() }]);
    expect(alwaysAvailableSections(999, catalog, NO_PREFS, "lunch")).toEqual([]);
  });

  it("returns nothing before the catalog has synced", () => {
    expect(alwaysAvailableSections(1, null, NO_PREFS, "lunch")).toEqual([]);
  });

  it("returns nothing for a café (no hallTid)", () => {
    const catalog = catalogWith([{ dishName: "Lettuce", nutrition: nutrition() }]);
    expect(alwaysAvailableSections(undefined, catalog, NO_PREFS, "lunch")).toEqual([]);
  });

  it("silently skips a curated dish not yet in the synced catalog, same as a missing station", () => {
    // Worcester's real curated Salad Bar list has 20 dishes; only one is in the catalog here.
    const catalog = catalogWith([{ dishName: "Lettuce", nutrition: nutrition() }]);
    const sections = alwaysAvailableSections(1, catalog, NO_PREFS, "lunch");
    const saladBar = sections.find((s) => s.title === "Salad Bar")!;
    expect(saladBar.data.map((i) => i.dishName)).toEqual(["Lettuce"]);
  });

  it("drops a station entirely once every one of its dishes is filtered out or unsynced", () => {
    const catalog = catalogWith([{ dishName: "Cheese Pizza", nutrition: nutrition(), allergens: ["Milk"] }]);
    const prefs: FoodPreferences = { allergensToAvoid: ["Milk"], requiredDietTags: [] };
    expect(alwaysAvailableSections(2, catalog, prefs, "lunch")).toEqual([]);
  });

  it("renders identically across meal-period tabs (same dishes/nutrition, not date/meal-gated)", () => {
    const catalog = catalogWith([{ dishName: "Cheese Pizza", nutrition: nutrition({ calories: 285 }) }]);
    const lunch = alwaysAvailableSections(2, catalog, NO_PREFS, "lunch");
    const dinner = alwaysAvailableSections(2, catalog, NO_PREFS, "dinner");
    expect(lunch[0].data.map((i) => ({ dishName: i.dishName, nutrition: i.nutrition }))).toEqual(
      dinner[0].data.map((i) => ({ dishName: i.dishName, nutrition: i.nutrition })),
    );
  });

  // The stepper/hold-drag ladder itself is untouched -- reused verbatim -- but the acceptance
  // criterion is that a bulk/scoop item's first tap adds exactly 1 unit sized to its OWN stated
  // serving (e.g. "Lettuce -- 10 cal/cup" adds 1 cup, not a generic default). menuItemToPlate
  // Entry(item) is what HoldSlideAddButton's onQuickAdd (a plain tap) calls for any dish -- proving
  // it here confirms the wiring, not a new gesture.
  it("a bulk/scoop item's first tap (menuItemToPlateEntry, count defaults to 1) adds exactly 1 of its own stated serving", () => {
    const lettuceNutrition = nutrition({ servingSize: "1 cup", calories: 10 });
    const catalog = catalogWith([{ dishName: "Lettuce", nutrition: lettuceNutrition }]);
    const [saladBar] = alwaysAvailableSections(1, catalog, NO_PREFS, "lunch");
    const entry = menuItemToPlateEntry(saladBar.data[0]);
    expect(entry.count).toBe(1);
    expect(entry.nutrition).toEqual(lettuceNutrition);
    expect(entry.nutrition.servingSize).toBe("1 cup");
  });
});
