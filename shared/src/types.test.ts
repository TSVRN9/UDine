import assert from "node:assert/strict";
import { test } from "node:test";
import { favoriteKey, menuItemMatchesPreferences } from "./types.ts";
import type { MenuItem, NutritionFacts } from "./types.ts";

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
