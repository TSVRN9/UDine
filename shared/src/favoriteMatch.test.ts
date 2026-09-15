import assert from "node:assert/strict";
import { test } from "node:test";
import { matchFavoritedDishes } from "./favoriteMatch.ts";
import type { Favorite, MenuItem, NutritionFacts } from "./types.ts";

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
    dishName: "Chicken Parm",
    category: "Entrees",
    mealPeriod: "lunch",
    hallTid: 1,
    date: "2026-09-15",
    nutrition: NUTRITION,
    allergens: [],
    dietTags: [],
    ...overrides,
  };
}

function dishFavorite(dishName: string): Favorite {
  return { type: "dish", dishName };
}

test("matches a favorited dish present in the menu items", () => {
  const matches = matchFavoritedDishes([dishFavorite("Chicken Parm")], [item({})]);
  assert.deepEqual(matches, [{ dishName: "Chicken Parm", hallTid: 1, mealPeriod: "lunch", date: "2026-09-15" }]);
});

test("the same dish at two halls produces two matches, one per hall", () => {
  const matches = matchFavoritedDishes(
    [dishFavorite("Chicken Parm")],
    [item({ hallTid: 1 }), item({ hallTid: 2 })],
  );
  assert.deepEqual(
    matches.map((m) => m.hallTid).sort(),
    [1, 2],
  );
});

test("a dish listed under two meal periods at the same hall keeps only the FIRST meal period it's found under (mirrors extractDishMealMap)", () => {
  const matches = matchFavoritedDishes(
    [dishFavorite("Chicken Parm")],
    [item({ mealPeriod: "breakfast" }), item({ mealPeriod: "lunch" })],
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0]!.mealPeriod, "breakfast");
});

test("exact match is case-sensitive: differing case does not match", () => {
  const matches = matchFavoritedDishes([dishFavorite("chicken parm")], [item({ dishName: "Chicken Parm" })]);
  assert.deepEqual(matches, []);
});

test("exact match is not substring/fuzzy: a favorite that's a substring of a menu dish name does not match", () => {
  const matches = matchFavoritedDishes([dishFavorite("Chicken")], [item({ dishName: "Chicken Parm" })]);
  assert.deepEqual(matches, []);
});

test("a favorite with surrounding whitespace does not match — favorite dish_name is looked up verbatim, exactly like check-favorited-foods' dishes.get(fav.dish_name)", () => {
  const matches = matchFavoritedDishes([dishFavorite("Chicken Parm ")], [item({ dishName: "Chicken Parm" })]);
  assert.deepEqual(matches, []);
});

test("a location favorite is never a food match", () => {
  const matches = matchFavoritedDishes([{ type: "location", hallTid: 1 }], [item({})]);
  assert.deepEqual(matches, []);
});

test("no matches when nothing on the menu matches any favorite", () => {
  const matches = matchFavoritedDishes([dishFavorite("Tofu Stir Fry")], [item({ dishName: "Chicken Parm" })]);
  assert.deepEqual(matches, []);
});

test("a duplicate dish name across favorites doesn't produce duplicate matches for the same hall", () => {
  const matches = matchFavoritedDishes([dishFavorite("Chicken Parm"), dishFavorite("Chicken Parm")], [item({})]);
  assert.equal(matches.length, 1);
});
