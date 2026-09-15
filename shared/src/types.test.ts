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

const ALL_PRESETS: MacroPreset[] = ["high-protein", "low-sodium", "under-300-cal", "low-fat", "high-fiber"];

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

test("low-sodium badges at <=140mg sodium (FDA 'low sodium' claim), not above", () => {
  assert.deepEqual(menuItemMacroBadges(item({ nutrition: { ...NUTRITION, sodiumMg: 140 } }), prefsWith(["low-sodium"])), ["low-sodium"]);
  assert.deepEqual(menuItemMacroBadges(item({ nutrition: { ...NUTRITION, sodiumMg: 141 } }), prefsWith(["low-sodium"])), []);
});

test("under-300-cal badges at <=300 calories, not above", () => {
  assert.deepEqual(menuItemMacroBadges(item({ nutrition: { ...NUTRITION, calories: 300 } }), prefsWith(["under-300-cal"])), ["under-300-cal"]);
  assert.deepEqual(menuItemMacroBadges(item({ nutrition: { ...NUTRITION, calories: 301 } }), prefsWith(["under-300-cal"])), []);
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

test("high-fiber badges at >=1.5g fiber per 100kcal (density), not below", () => {
  // 3g fiber / 200cal = 1.5 exactly; 3g / 201cal = 1.4925, just under.
  assert.deepEqual(
    menuItemMacroBadges(item({ nutrition: { ...NUTRITION, dietaryFiberG: 3, calories: 200 } }), prefsWith(["high-fiber"])),
    ["high-fiber"],
  );
  assert.deepEqual(
    menuItemMacroBadges(item({ nutrition: { ...NUTRITION, dietaryFiberG: 3, calories: 201 } }), prefsWith(["high-fiber"])),
    [],
  );
});

test("high-fiber's MIN_FIBER_G floor is a real second gate, not a no-op -- high density alone isn't enough", () => {
  // Both fixtures clear the density cutoff comfortably (>=1.5/100kcal); only the absolute gram
  // floor differs, pinning MIN_FIBER_G's own value rather than just re-testing the density gate.
  // 1.5g / 100cal = 1.5 density, right at the floor -- passes.
  assert.deepEqual(
    menuItemMacroBadges(item({ nutrition: { ...NUTRITION, dietaryFiberG: 1.5, calories: 100 } }), prefsWith(["high-fiber"])),
    ["high-fiber"],
  );
  // 1.49g / 99cal = 1.505 density (still clears 1.5... barely -- density isn't the gate under test
  // here), but 1.49g fiber is just under the 1.5g floor -- fails on the floor alone.
  assert.deepEqual(
    menuItemMacroBadges(item({ nutrition: { ...NUTRITION, dietaryFiberG: 1.49, calories: 99 } }), prefsWith(["high-fiber"])),
    [],
  );
});

test("high-fiber guards the 0-calorie case -- doesn't throw, doesn't qualify on density alone", () => {
  assert.deepEqual(
    menuItemMacroBadges(item({ nutrition: { ...NUTRITION, dietaryFiberG: 5, calories: 0 } }), prefsWith(["high-fiber"])),
    [],
  );
});

test("menuItemMacroBadges suppresses high-fiber when high-protein also qualifies (protein takes priority)", () => {
  const dish = item({
    nutrition: { ...NUTRITION, proteinG: 25, sodiumMg: 100, calories: 200, totalFatG: 2, dietaryFiberG: 6 },
  });
  assert.deepEqual(menuItemMacroBadges(dish, prefsWith(ALL_PRESETS)), ALL_PRESETS.filter((p) => p !== "high-fiber"));
});

test("menuItemMacroBadges still shows high-fiber alone when only high-fiber is enabled (suppression is conditional on high-protein being enabled too)", () => {
  const dish = item({
    // proteinG below the high-protein cut so this isn't a "protein qualifies but isn't enabled" case
    // in disguise -- it genuinely doesn't qualify for high-protein either.
    nutrition: { ...NUTRITION, proteinG: 5, dietaryFiberG: 6, calories: 200 },
  });
  assert.deepEqual(menuItemMacroBadges(dish, prefsWith(["high-fiber"])), ["high-fiber"]);
});

// Real captured UMass Harvest Market pizza data (umassDining.test.ts's
// REAL_HARVEST_MARKET_PIZZA_FRAGMENT, Cheese Pizza): 445 cal, 21.9g protein, 5.9g fiber. Clears the
// old flat >=2g fiber check AND the >=10g protein check simultaneously -- reads as contradictory
// ("basically meat AND basically oatmeal"). Density = 5.9/445*100 = 1.33g per 100kcal, under the
// 1.5 cutoff -- not actually fiber-dense, just high-calorie.
const PIZZA_NUTRITION: NutritionFacts = { ...NUTRITION, calories: 445, proteinG: 21.9, dietaryFiberG: 5.9 };

test("real pizza data (#regression): high-protein wins, high-fiber is suppressed when both are enabled", () => {
  const dish = item({ nutrition: PIZZA_NUTRITION });
  assert.deepEqual(menuItemMacroBadges(dish, prefsWith(["high-protein", "high-fiber"])), ["high-protein"]);
});

test("real pizza data (#regression): fiber density alone doesn't qualify -- fails against the old flat 2g check", () => {
  const dish = item({ nutrition: PIZZA_NUTRITION });
  // Only high-fiber enabled (protein not even in the running) -- this isolates the density
  // recalibration from the priority suppression. The old flat `dietaryFiberG >= 2` check passed
  // this dish (5.9g >= 2g); the new density check (1.33 < 1.5) correctly excludes it.
  assert.deepEqual(menuItemMacroBadges(dish, prefsWith(["high-fiber"])), []);
});

test("menuItemMacroBadges ignores a stale preset name left over from a rename instead of throwing", () => {
  // A device that toggled "under-500-cal" on before it was renamed to "under-300-cal" (ca19cc2)
  // keeps that string in its stored FoodPreferences forever -- getPreferences' migration only
  // covers a macroPresets field that's missing entirely, not one whose values have gone stale.
  const dish = item({ nutrition: { ...NUTRITION, proteinG: 25 } });
  const prefs = prefsWith(["under-500-cal" as MacroPreset, "high-protein"]);
  assert.deepEqual(menuItemMacroBadges(dish, prefs), ["high-protein"]);
});
