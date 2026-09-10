import assert from "node:assert/strict";
import { test } from "node:test";
import { favoriteKey, menuItemMacroBadges, menuItemMatchesPreferences } from "./types.ts";
import type { FoodPreferences, MacroPreset, MenuItem, NutritionFacts } from "./types.ts";

const NUTRITION: NutritionFacts = {
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
};

function item(overrides: Partial<MenuItem>): MenuItem {
  return {
    dishName: "Test Dish",
    category: "Entrees",
    mealPeriod: "lunch",
    hallTid: 1,
    date: "2026-08-17",
    nutrition: NUTRITION,
    allergens: [],
    dietTags: [],
    ...overrides,
  };
}

test("menuItemMatchesPreferences excludes a dish containing an avoided allergen", () => {
  const dish = item({ allergens: ["Milk", "Gluten"] });
  assert.equal(menuItemMatchesPreferences(dish, { allergensToAvoid: ["Milk"], requiredDietTags: [] }), false);
});

test("menuItemMatchesPreferences requires ALL requested diet tags to be present", () => {
  const dish = item({ dietTags: ["Vegan"] });
  assert.equal(menuItemMatchesPreferences(dish, { allergensToAvoid: [], requiredDietTags: ["Vegan"] }), true);
  assert.equal(menuItemMatchesPreferences(dish, { allergensToAvoid: [], requiredDietTags: ["Vegan", "Halal"] }), false);
});

test("menuItemMatchesPreferences passes a dish with no conflicts and no requirements", () => {
  const dish = item({ allergens: ["Soy"], dietTags: ["Vegetarian"] });
  assert.equal(menuItemMatchesPreferences(dish, { allergensToAvoid: [], requiredDietTags: [] }), true);
});

test("favoriteKey distinguishes dish and location favorites", () => {
  assert.equal(favoriteKey({ type: "dish", dishName: "Black Beans" }), "dish:Black Beans");
  assert.equal(favoriteKey({ type: "location", hallTid: 3 }), "location:3");
});

function prefsWith(macroPresets: MacroPreset[]): FoodPreferences {
  return { allergensToAvoid: [], requiredDietTags: [], macroPresets };
}

const ALL_PRESETS: MacroPreset[] = ["high-protein", "low-sodium", "under-500-cal", "low-fat", "high-fiber"];

test("menuItemMacroBadges never returns a preset the caller hasn't enabled", () => {
  const dish = item({ nutrition: { ...NUTRITION, proteinG: 30 } });
  assert.deepEqual(menuItemMacroBadges(dish, prefsWith([])), []);
});

test("menuItemMacroBadges treats a missing macroPresets field as none enabled", () => {
  const dish = item({ nutrition: { ...NUTRITION, proteinG: 30 } });
  assert.deepEqual(menuItemMacroBadges(dish, { allergensToAvoid: [], requiredDietTags: [] }), []);
});

test("high-protein badges at >=10g protein (FDA 'high'/'excellent source' claim, 20% of the 50g DV), not below", () => {
  assert.deepEqual(menuItemMacroBadges(item({ nutrition: { ...NUTRITION, proteinG: 10 } }), prefsWith(["high-protein"])), ["high-protein"]);
  assert.deepEqual(menuItemMacroBadges(item({ nutrition: { ...NUTRITION, proteinG: 9.9 } }), prefsWith(["high-protein"])), []);
});

test("low-sodium badges at <=400mg sodium, not above", () => {
  assert.deepEqual(menuItemMacroBadges(item({ nutrition: { ...NUTRITION, sodiumMg: 400 } }), prefsWith(["low-sodium"])), ["low-sodium"]);
  assert.deepEqual(menuItemMacroBadges(item({ nutrition: { ...NUTRITION, sodiumMg: 401 } }), prefsWith(["low-sodium"])), []);
});

test("under-500-cal badges at <=500 calories, not above", () => {
  assert.deepEqual(menuItemMacroBadges(item({ nutrition: { ...NUTRITION, calories: 500 } }), prefsWith(["under-500-cal"])), ["under-500-cal"]);
  assert.deepEqual(menuItemMacroBadges(item({ nutrition: { ...NUTRITION, calories: 501 } }), prefsWith(["under-500-cal"])), []);
});

test("low-fat badges at <=3g total fat (standard 'low fat' labeling cap), not above", () => {
  // An absolute per-serving cap, not a calorie ratio -- a ratio both under-badges a near-zero-
  // fat/near-zero-calorie condiment and over-badges a high-fat, high-calorie dish at the same
  // ratio, contradicting this file's own "conservative absolute caps" rationale. A 0-calorie item
  // still badges correctly here since nothing divides by calories anymore.
  assert.deepEqual(menuItemMacroBadges(item({ nutrition: { ...NUTRITION, calories: 90, totalFatG: 3 } }), prefsWith(["low-fat"])), ["low-fat"]);
  assert.deepEqual(menuItemMacroBadges(item({ nutrition: { ...NUTRITION, calories: 90, totalFatG: 3.1 } }), prefsWith(["low-fat"])), []);
  assert.deepEqual(menuItemMacroBadges(item({ nutrition: { ...NUTRITION, calories: 0, totalFatG: 0 } }), prefsWith(["low-fat"])), ["low-fat"]);
});

test("high-fiber badges at >=5g dietary fiber, not below", () => {
  assert.deepEqual(menuItemMacroBadges(item({ nutrition: { ...NUTRITION, dietaryFiberG: 5 } }), prefsWith(["high-fiber"])), ["high-fiber"]);
  assert.deepEqual(menuItemMacroBadges(item({ nutrition: { ...NUTRITION, dietaryFiberG: 4.9 } }), prefsWith(["high-fiber"])), []);
});

test("menuItemMacroBadges returns every enabled preset a dish qualifies for", () => {
  const dish = item({
    nutrition: { ...NUTRITION, proteinG: 25, sodiumMg: 100, calories: 200, totalFatG: 2, dietaryFiberG: 6 },
  });
  assert.deepEqual(menuItemMacroBadges(dish, prefsWith(ALL_PRESETS)), ALL_PRESETS);
});
