import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCategoryItems } from "./umassDining.ts";

// Real fragment captured from GET foodpro-menu-ajax?tid=3&date=08%2F19%2F2026 (Hampshire, breakfast,
// "Breakfast Entrees"), trimmed to two <a> items — see docs/apk-reverse-engineering.md.
const REAL_FRAGMENT = `<a data-healthfulness="30" data-carbon-list="B" data-ingredient-list="FREIHOFFER&#039;S Country White Bread" data-allergens="Milk, Eggs, Gluten, Soy, Corn  , Wheat" data-recipe-webcode="LPR SUS VGT H3 CR2" data-clean-diet-str="Local, Sustainable, Vegetarian" data-serving-size="1 each" data-calories="127" data-calories-from-fat="26" data-total-fat="2.9g" data-total-fat-dv="4" data-sat-fat="0.5g" data-sat-fat-dv="" data-trans-fat="0g" data-cholesterol="50.9mg" data-cholesterol_dv="" data-sodium="237.2mg" data-sodium-dv="10" data-total-carb="20.4g" data-total-carb-dv="16" data-dietary-fiber="1g" data-dietary-fiber-dv="3" data-sugars="3.4g" data-sugars-dv="" data-protein="5.3g" data-protein-dv="9" data-dish-name="French Toast" href="#inline">French Toast</a><a data-healthfulness="30" data-carbon-list="A" data-ingredient-list="Sweet Plantains" data-allergens="Milk, Eggs, Gluten, Soy, Corn  , Sesame , Wheat" data-recipe-webcode="VGT H3 CR1" data-clean-diet-str="Vegetarian" data-serving-size="1 OZ" data-calories="69" data-calories-from-fat="33" data-total-fat="3.7g" data-total-fat-dv="5" data-sat-fat="0.7g" data-sat-fat-dv="" data-trans-fat="0g" data-cholesterol="0mg" data-cholesterol_dv="" data-sodium="123.2mg" data-sodium-dv="5" data-total-carb="8.9g" data-total-carb-dv="7" data-dietary-fiber="0.2g" data-dietary-fiber-dv="1" data-sugars="8.2g" data-sugars-dv="" data-protein="0.3g" data-protein-dv="0" data-dish-name="Fried Plantain" href="#inline">Fried Plantain</a>`;

test("parseCategoryItems extracts both dishes with correct nutrition and decodes HTML entities", () => {
  const items = parseCategoryItems(REAL_FRAGMENT, "Breakfast Entrees", "breakfast", 3, "2026-08-19");
  assert.equal(items.length, 2);

  const [toast, plantain] = items;
  assert.equal(toast.dishName, "French Toast");
  assert.equal(toast.category, "Breakfast Entrees");
  assert.equal(toast.mealPeriod, "breakfast");
  assert.equal(toast.hallTid, 3);
  assert.equal(toast.date, "2026-08-19");
  assert.equal(toast.nutrition.calories, 127);
  assert.equal(toast.nutrition.proteinG, 5.3);
  assert.equal(toast.nutrition.totalFatG, 2.9);
  assert.deepEqual(toast.allergens, ["Milk", "Eggs", "Gluten", "Soy", "Corn", "Wheat"]);
  assert.deepEqual(toast.dietTags, ["Local", "Sustainable", "Vegetarian"]);
  assert.ok(toast.nutrition.servingSize === "1 each");

  assert.equal(plantain.dishName, "Fried Plantain");
  assert.equal(plantain.nutrition.calories, 69);
});

test("parseCategoryItems captures %DV attributes, including the cholesterol_dv underscore quirk, with blanks as null", () => {
  const [toast] = parseCategoryItems(REAL_FRAGMENT, "Breakfast Entrees", "breakfast", 3, "2026-08-19");
  assert.equal(toast.nutrition.totalFatDv, 4);
  assert.equal(toast.nutrition.satFatDv, null); // data-sat-fat-dv="" in the real fragment
  assert.equal(toast.nutrition.cholesterolDv, null); // data-cholesterol_dv="" — underscore, not hyphen
  assert.equal(toast.nutrition.sodiumDv, 10);
  assert.equal(toast.nutrition.totalCarbDv, 16);
  assert.equal(toast.nutrition.dietaryFiberDv, 3);
  assert.equal(toast.nutrition.sugarsDv, null); // data-sugars-dv="" in the real fragment
  assert.equal(toast.nutrition.proteinDv, 9);
});

// Synthetic — a fragment where a -dv attribute is entirely ABSENT from the tag, not just blank
// (data-cholesterol_dv="" like the real fragment above). getAttr previously returned "" for both
// "no such attribute" and "attribute present but empty", so dv() collapsed both to null and a
// mutated/misspelled attribute name (e.g. the cholesterol_dv underscore -> hyphen) was
// indistinguishable from a legitimately blank one — the exact case types.ts:24-27 already
// documents (undefined = source has no %DV concept for this field at all, null = present but blank).
const FRAGMENT_MISSING_DV_ATTR = `<a data-serving-size="1 each" data-calories="100" data-calories-from-fat="0" data-total-fat="1g" data-total-fat-dv="2" data-sat-fat="0g" data-trans-fat="0g" data-cholesterol="0mg" data-sodium="0mg" data-total-carb="0g" data-dietary-fiber="0g" data-sugars="0g" data-protein="0g" data-dish-name="No DV Dish" href="#inline">No DV Dish</a>`;

test("parseCategoryItems distinguishes an absent %DV attribute (undefined) from a present-but-blank one (null)", () => {
  const [item] = parseCategoryItems(FRAGMENT_MISSING_DV_ATTR, "x", "breakfast", 3, "2026-08-19");
  // data-total-fat-dv="2" IS present -> a real number.
  assert.equal(item.nutrition.totalFatDv, 2);
  // data-sat-fat-dv is entirely absent from this tag (not ="") -> undefined, not null.
  assert.equal(item.nutrition.satFatDv, undefined);
  assert.notEqual(item.nutrition.satFatDv, null); // undefined !== null: absent is not the same as blank

  // The real fragment's blanks (="") are still null, not undefined -- present, just empty.
  const [toast] = parseCategoryItems(REAL_FRAGMENT, "Breakfast Entrees", "breakfast", 3, "2026-08-19");
  assert.equal(toast.nutrition.cholesterolDv, null);
  assert.notEqual(toast.nutrition.cholesterolDv, undefined);
});

test("parseCategoryItems returns nothing for a fragment with no dishes", () => {
  assert.deepEqual(parseCategoryItems("<h2>Closed today</h2>", "x", "breakfast", 3, "2026-08-19"), []);
});
