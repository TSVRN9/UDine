import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchMenu, GRAB_N_GO_TIDS, hallNameFor, hallNameForOrNull, mealPeriodLabel, MEAL_PERIODS, parseCategoryItems } from "./umassDining.ts";

// fetchMenu calls the global fetch directly (no injectable client) -- swap it for a stub and
// restore afterward, same pattern as openFoodFacts.test.ts.
function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

// #108: hallNameFor/hallNameForOrNull are the one canonical hall-tid-to-display-name lookup,
// replacing 4+ hand-copied versions across mobile (and web) that disagreed on fallback behavior.
test("hallNameFor resolves a known hall tid to its name", () => {
  assert.equal(hallNameFor(1), "Worcester");
  assert.equal(hallNameFor(3), "Hampshire");
});

test("hallNameFor falls back to `Hall <tid>` for an unrecognized tid", () => {
  assert.equal(hallNameFor(999), "Hall 999");
});

// #121: a menu item/log entry sourced from a hall's Grab 'N Go station carries that station's own
// distinct tid (GRAB_N_GO_TIDS), not the hall's -- hallNameFor should read as "<hall> Grab 'N Go",
// not the raw station tid ("Hall 10667"), since it's the same physical hall's own separate station.
// Bare "Worcester" (the parent hall's own name, unqualified) is deliberately wrong here: rank.tsx's
// pairwise comparison UI (and web/routes/rank) dedupes/labels dishes by hallTid, and a dish logged
// from both the hall and its Grab 'N Go station are DIFFERENT Dish rows (different hallTid) that can
// legitimately appear side by side -- bare "Worcester" for both would make them indistinguishable.
test("hallNameFor resolves a Grab 'N Go station tid to its own, distinguishable label", () => {
  assert.equal(hallNameFor(GRAB_N_GO_TIDS.worcester), "Worcester Grab 'N Go");
  assert.equal(hallNameFor(GRAB_N_GO_TIDS.hampshire), "Hampshire Grab 'N Go");
});

test("hallNameFor never collapses a hall and its own Grab 'N Go station to the same label", () => {
  for (const hall of ["worcester", "franklin", "hampshire", "berkshire"] as const) {
    const hallTid = { worcester: 1, franklin: 2, hampshire: 3, berkshire: 4 }[hall];
    assert.notEqual(hallNameFor(hallTid), hallNameFor(GRAB_N_GO_TIDS[hall]));
  }
});

// hallNameForOrNull is for presentational call sites that want to omit the label entirely rather
// than show a fallback string -- null in, null out; an unresolvable non-null tid is also null (not
// `Hall <tid>`), matching youPaneFormat.ts's pre-existing TopFoodDisplay.hallName contract.
test("hallNameForOrNull returns null for a null tid and for an unresolvable tid", () => {
  assert.equal(hallNameForOrNull(null), null);
  assert.equal(hallNameForOrNull(999), null);
});

test("hallNameForOrNull resolves known and Grab 'N Go tids the same as hallNameFor", () => {
  assert.equal(hallNameForOrNull(3), "Hampshire");
  assert.equal(hallNameForOrNull(GRAB_N_GO_TIDS.berkshire), "Berkshire Grab 'N Go");
});

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

// #176: real fragment captured from GET foodpro-menu-ajax?tid=4671&date=08%2F24%2F2026 (Green
// Fields, lunch, "Add-ons"), two consecutive dishes -- confirms the retail-only price span
// (`<span class="meal-price">$X.XX</span>`, AFTER the closing </a>, with 0+ <img> legend icons in
// between) parses per-item, not just for whichever dish happens to be first in the fragment.
const REAL_GREEN_FIELDS_PRICED_FRAGMENT = `<li class="lightbox-nutrition"><a data-healthfulness="50" data-carbon-list="A" data-ingredient-list="Avocados" data-allergens="" data-recipe-webcode="H VGN VGT H5 CR1" data-clean-diet-str="Halal, Plant Based, Vegetarian" data-serving-size="1/2 each" data-calories="166" data-calories-from-fat="138" data-total-fat="15.3g" data-total-fat-dv="20" data-sat-fat="2.1g" data-sat-fat-dv="" data-trans-fat="0g" data-cholesterol="0mg" data-cholesterol_dv="" data-sodium="7.9mg" data-sodium-dv="0" data-total-carb="8.6g" data-total-carb-dv="7" data-dietary-fiber="6.7g" data-dietary-fiber-dv="20" data-sugars="0.3g" data-sugars-dv="" data-protein="1.9g" data-protein-dv="3" data-dish-name="Add Fresh Avocado" href="#inline">Add Fresh Avocado</a><img src="https://umassdining.com/sites/default/files/legends/icon-hal.png" alt="" style="width: 16px; height: 16px; margin-left: 5px;" /><img src="https://umassdining.com/sites/default/files/legends/icon-vegan.png" alt="" style="width: 16px; height: 16px; margin-left: 5px;" /><img src="https://umassdining.com/sites/default/files/legends/icon-veg.png" alt="" style="width: 16px; height: 16px; margin-left: 5px;" /><img src="https://umassdining.com/sites/default/files/legends/icon-cr-a.png" alt="" style="width: 16px; height: 16px; margin-left: 5px;" /><span class="meal-price">$2.50</span></li><li class="lightbox-nutrition"><a data-healthfulness="0" data-carbon-list="E" data-ingredient-list="HORMEL Applewood Smoked Bacon (Pork cured with: Water, Salt, Sugar, Smoke Flavoring, Sodium Erythorbate, Sodium Phosphates, Sodium Nitrite)" data-allergens="" data-recipe-webcode="H0 CR5" data-clean-diet-str="None" data-serving-size="1 oz" data-calories="122" data-calories-from-fat="85" data-total-fat="9.4g" data-total-fat-dv="12" data-sat-fat="3.8g" data-sat-fat-dv="" data-trans-fat="0g" data-cholesterol="23.5mg" data-cholesterol_dv="" data-sodium="460mg" data-sodium-dv="20" data-total-carb="0.9g" data-total-carb-dv="1" data-dietary-fiber="0g" data-dietary-fiber-dv="0" data-sugars="0.9g" data-sugars-dv="" data-protein="7.5g" data-protein-dv="13" data-dish-name="Bacon" href="#inline">Bacon</a><img src="https://umassdining.com/sites/default/files/legends/icon-cr-e.png" alt="" style="width: 16px; height: 16px; margin-left: 5px;" /><span class="meal-price">$3.00</span></li>`;

test("parseCategoryItems parses the retail-only meal-price span into MenuItem.price, per item (#176)", () => {
  const [avocado, bacon] = parseCategoryItems(REAL_GREEN_FIELDS_PRICED_FRAGMENT, "Add-ons", "lunch", 4671, "2026-08-24");
  assert.equal(avocado.dishName, "Add Fresh Avocado");
  assert.equal(avocado.price, "$2.50");
  assert.equal(bacon.dishName, "Bacon");
  assert.equal(bacon.price, "$3.00");
});

test("parseCategoryItems leaves price undefined for a hall fragment with no meal-price span (#176)", () => {
  const [toast] = parseCategoryItems(REAL_FRAGMENT, "Breakfast Entrees", "breakfast", 3, "2026-08-19");
  assert.equal(toast.price, undefined);
});

// #117: confirmed live 2026-08-21 (GET foodpro-menu-ajax?tid=1&date=08%2F21%2F2026) that the feed
// really does key a 4th meal period as "late night" (literal space) -- not "latenight", not absent.
// Previously fetchMenu's MEAL_PERIODS loop only ever looked up "breakfast"/"lunch"/"dinner", so
// these dishes were silently dropped, not just unlabeled.
test("fetchMenu maps the feed's 'late night' key to MealPeriod 'latenight' instead of dropping it", async () => {
  const items = await withFetch(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          lunch: { Entrees: REAL_FRAGMENT },
          "late night": { Mediterranean: FRAGMENT_MISSING_DV_ATTR },
        }),
      }) as Response,
    () => fetchMenu(1, new Date(2026, 7, 21)),
  );

  const lateNightItems = items.filter((i) => i.category === "Mediterranean");
  assert.equal(lateNightItems.length, 1);
  assert.equal(lateNightItems[0].dishName, "No DV Dish");
  assert.equal(lateNightItems[0].mealPeriod, "latenight");

  // lunch items still parse as before -- this isn't a regression on the existing keys.
  const lunchItems = items.filter((i) => i.mealPeriod === "lunch");
  assert.equal(lunchItems.length, 2);
});

// #137: web's hall page hardcoded its own ["breakfast","lunch","dinner"] list instead of consuming
// this mapping, so "latenight" -- reachable since #133 -- never rendered there. MEAL_PERIODS is the
// single source of truth callers should build their meal-period UI off of.
test("MEAL_PERIODS includes latenight, in the same order fetchMenu maps wire keys", () => {
  assert.deepEqual(MEAL_PERIODS, ["breakfast", "lunch", "dinner", "latenight"]);
});

test("mealPeriodLabel gives latenight a readable two-word label; the rest just title-case", () => {
  assert.equal(mealPeriodLabel("breakfast"), "Breakfast");
  assert.equal(mealPeriodLabel("lunch"), "Lunch");
  assert.equal(mealPeriodLabel("dinner"), "Dinner");
  assert.equal(mealPeriodLabel("latenight"), "Late Night");
});

// #175: real fragment captured from GET foodpro-menu-ajax?tid=32&date=08%2F24%2F2026 (People's
// Organic Coffee, "daily offerings" key, "Salad Bar/Dressings" category) -- a live café whose ENTIRE
// menu is keyed "daily offerings", not breakfast/lunch/dinner. Before #175, RAW_MEAL_PERIOD_KEYS
// only recognized breakfast/lunch/dinner/"late night", so this whole 27KB response was silently
// dropped -- the café looked menu-less when it wasn't.
const REAL_DAILY_OFFERINGS_FRAGMENT = `<a data-healthfulness="40" data-carbon-list="None" data-ingredient-list="Fresh Strawberries, Spinach, LITTLE LEAF Local Spring Mix (Arugula, Green Leaf Lettuce, Multiblend Lettuce, Red Chard, Red Leaf Lettuce), Glazed Pecan Halves (Pecans, Sugar, Salt, Vanilla (Water, Alcohol, Sugar &amp; Bean Extractives)), Olympus Greek Feta Cheese  (Pasteurized Sheep Milk, Salt, Cultures, Microbial Rennet), Balsamic Glaze (Balsamic Vinegar of Modena &quot;Aceto Balsamico Di Modena IGP&quot; 70% [Wine Vinegar, Concentrated Grape Must], Glucose Syrup, Sugar, Modified Corn Starch, Xanthan Gum, Contains Sulfites)" data-allergens="Milk, Tree Nuts, Corn  " data-recipe-webcode="LPR SUS VGT H4" data-clean-diet-str="Local, Sustainable, Vegetarian" data-serving-size="1 EACH" data-calories="378" data-calories-from-fat="176" data-total-fat="19.5g" data-total-fat-dv="25" data-sat-fat="5g" data-sat-fat-dv="" data-trans-fat="0g" data-cholesterol="0mg" data-cholesterol_dv="" data-sodium="811.2mg" data-sodium-dv="35" data-total-carb="41.5g" data-total-carb-dv="32" data-dietary-fiber="5.1g" data-dietary-fiber-dv="15" data-sugars="30.7g" data-sugars-dv="" data-protein="9.1g" data-protein-dv="16" data-dish-name="Strawberry Pecan Salad" href="#inline">Strawberry Pecan Salad</a>`;

// Real fragment captured the same day from the same tid=32 response, "grabngo" key, "Grab n'Go Hot "
// category -- confirms retail locations can carry a "grabngo" key alongside (or instead of) the
// standard meal-period keys. Harvest Market (tid=4306) independently confirmed live the same day:
// ["breakfast","lunch","grabngo","dinner"].
const REAL_GRABNGO_FRAGMENT = `<a data-healthfulness="0" data-carbon-list="None" data-ingredient-list="Pillsbury Buttermilk Biscuit   (Enriched Flour Bleached (Wheat Flour, Malted Barley Flour, Niacin, Iron, Thiamin Mononitrate, Riboflavin, Folic Acid), Water, Palm Oil, Buttermilk, Sugar, Baking Soda, Salt, Sodium Aluminum Phosphate, Sodium Acid Pyrophosphate, Palm Kernel Oil), Local Cage Free Eggs, Sausage Patty (Pork, Water, Contains 2% or less of Salt, Spices, Dextrose, Sugar, Yeast Extract, Lime Flavor (Corn Syrup Solids, Lime Juice Solids, Natural Flavor), Flavoring, BHT, TBHQ, Citric Acid, Lactic Acid)" data-allergens="Milk, Eggs, Gluten, Corn  , Wheat" data-recipe-webcode="LPR SUS H0" data-clean-diet-str="Local, Sustainable" data-serving-size="1 each" data-calories="534" data-calories-from-fat="322" data-total-fat="35.7g" data-total-fat-dv="46" data-sat-fat="15.6g" data-sat-fat-dv="" data-trans-fat="0g" data-cholesterol="253.3mg" data-cholesterol_dv="" data-sodium="1038.2mg" data-sodium-dv="45" data-total-carb="34g" data-total-carb-dv="26" data-dietary-fiber="1g" data-dietary-fiber-dv="3" data-sugars="3g" data-sugars-dv="" data-protein="19g" data-protein-dv="34" data-dish-name="Sausage Biscuit w/ Egg" href="#inline">Sausage Biscuit w/ Egg</a>`;

test("fetchMenu maps the retail-only 'daily offerings' key to MealPeriod 'allday' instead of dropping it (#175)", async () => {
  const items = await fetchMenu(
    32,
    new Date(2026, 7, 24),
    (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ "daily offerings": { "Salad Bar/Dressings": REAL_DAILY_OFFERINGS_FRAGMENT } }),
      }) as Response) as typeof fetch,
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].dishName, "Strawberry Pecan Salad");
  assert.equal(items[0].mealPeriod, "allday");
  assert.equal(items[0].category, "Salad Bar/Dressings");
});

test("fetchMenu maps the retail-only 'grabngo' key to MealPeriod 'grabngo' instead of dropping it (#175)", async () => {
  const items = await fetchMenu(
    4306,
    new Date(2026, 7, 24),
    (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          breakfast: { Entrees: REAL_FRAGMENT },
          grabngo: { "Grab n'Go Hot ": REAL_GRABNGO_FRAGMENT },
        }),
      }) as Response) as typeof fetch,
  );

  const grabngoItems = items.filter((i) => i.mealPeriod === "grabngo");
  assert.equal(grabngoItems.length, 1);
  assert.equal(grabngoItems[0].dishName, "Sausage Biscuit w/ Egg");
  assert.equal(grabngoItems[0].category, "Grab n'Go Hot ");

  // the standard "breakfast" key alongside it still parses as before -- not a regression.
  const breakfastItems = items.filter((i) => i.mealPeriod === "breakfast");
  assert.equal(breakfastItems.length, 2);
});

// #175's design constraint: MealPeriod's hall-tab consolidation (#144/#160/#163) must not gain these
// two retail-only members -- hall UIs iterate MEAL_PERIODS for their always-4 tab row.
test("MEAL_PERIODS stays exactly the 4 hall-tab periods -- 'allday'/'grabngo' never appear in it (#175)", () => {
  assert.deepEqual(MEAL_PERIODS, ["breakfast", "lunch", "dinner", "latenight"]);
  // MEAL_PERIODS is typed HallMealPeriod[] specifically so "allday"/"grabngo" can't even be passed to
  // .includes() without a widening cast -- the runtime check below is belt-and-suspenders on top of
  // that compile-time guarantee.
  const periods: readonly string[] = MEAL_PERIODS;
  assert.ok(!periods.includes("allday"));
  assert.ok(!periods.includes("grabngo"));
});

// #169: UMass's foodpro-menu-ajax is deliberately uncacheable server-side (no ETag/Last-Modified,
// `cache-control: no-cache, private` -- confirmed live) so politeness has to be client-side. fetchMenu
// takes trailing `fetchImpl`/`now` seams (same shape as check-favorited-foods/index.ts's fetchHallMenu)
// purely for these tests; real callers never pass them. Each test below uses its own hallTid/date pair
// so the module-level cache from one test can't leak into another in this same process.

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

/** Counts calls and returns `body` synchronously (no artificial delay) -- fine for the cache-hit/TTL
 * tests below, which never overlap two in-flight calls. */
function makeCountingFetch(body: unknown): { fetchImpl: typeof fetch; getCalls: () => number } {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return jsonResponse(body);
  }) as typeof fetch;
  return { fetchImpl, getCalls: () => calls };
}

/** Like makeCountingFetch, but the returned promise only settles once `release()` is called -- lets a
 * test hold multiple concurrent fetchMenu calls "in flight" at once to prove they dedup. */
function makeDeferredFetch(body: unknown): { fetchImpl: typeof fetch; getCalls: () => number; release: () => void } {
  let calls = 0;
  let resolveFetch: (() => void) | undefined;
  const fetchImpl = (async () => {
    calls++;
    await new Promise<void>((resolve) => {
      resolveFetch = resolve;
    });
    return jsonResponse(body);
  }) as typeof fetch;
  return { fetchImpl, getCalls: () => calls, release: () => resolveFetch?.() };
}

/** Derives its response from the URL it's actually called with (echoes tid+date into a distinguishable
 * dish name) instead of returning one fixed body -- lets a test tell whether the cache key is really
 * `tid+date`, or only ever one half of it (a same-tid-different-date or same-date-different-tid
 * collision would silently serve the wrong hall's menu). */
function makeUrlEchoingFetch(): { fetchImpl: typeof fetch; getCalls: () => number } {
  let calls = 0;
  const fetchImpl = (async (input: RequestInfo | URL) => {
    calls++;
    const url = new URL(String(input));
    const dishName = `Dish-${url.searchParams.get("tid")}-${url.searchParams.get("date")}`;
    const html = `<a data-dish-name="${dishName}" href="#inline">${dishName}</a>`;
    return jsonResponse({ lunch: { Entrees: html } });
  }) as typeof fetch;
  return { fetchImpl, getCalls: () => calls };
}

// pr-reviewer finding on #170: every other test here used one fixed hall+date and a `{}` stub body,
// so an `deepEqual` on `[]` vs `[]` couldn't tell a correct cache key apart from a broken one --
// dropping either half of `tid|MM/DD/YYYY` from menuCacheKey still passed all four. This is the one
// test that actually depends on both halves.
test("fetchMenu's cache key is BOTH hallTid and date -- three distinct hall/date combos each get their own upstream call and come back with their own dish, not a neighbor's", async () => {
  const { fetchImpl, getCalls } = makeUrlEchoingFetch();
  const hallA = 61;
  const hallB = 62;
  const d1 = new Date(2026, 1, 10);
  const d2 = new Date(2026, 1, 11);

  const [a1, b1, a2] = await Promise.all([fetchMenu(hallA, d1, fetchImpl), fetchMenu(hallB, d1, fetchImpl), fetchMenu(hallA, d2, fetchImpl)]);

  assert.equal(getCalls(), 3);
  assert.equal(a1[0].dishName, "Dish-61-02/10/2026");
  assert.equal(b1[0].dishName, "Dish-62-02/10/2026"); // same date as a1, different hall -- must not collide
  assert.equal(a2[0].dishName, "Dish-61-02/11/2026"); // same hall as a1, different date -- must not collide
});

test("fetchMenu serves a second call within TTL from cache, not a second upstream fetch", async () => {
  const { fetchImpl, getCalls } = makeCountingFetch({});
  let t = 1_000_000;
  const now = () => t;

  const first = await fetchMenu(31, new Date(2026, 1, 2), fetchImpl, now);
  t += 29 * 60 * 1000; // still inside the ~30 min TTL
  const second = await fetchMenu(31, new Date(2026, 1, 2), fetchImpl, now);

  assert.equal(getCalls(), 1);
  assert.deepEqual(second, first);
});

test("fetchMenu re-fetches once the cached entry's TTL has expired", async () => {
  const { fetchImpl, getCalls } = makeCountingFetch({});
  let t = 1_000_000;
  const now = () => t;

  await fetchMenu(32, new Date(2026, 1, 3), fetchImpl, now);
  assert.equal(getCalls(), 1);

  t += 30 * 60 * 1000 + 1; // just past the ~30 min TTL
  await fetchMenu(32, new Date(2026, 1, 3), fetchImpl, now);
  assert.equal(getCalls(), 2);
});

test("concurrent calls for the same hall+date dedup to a single upstream request", async () => {
  const { fetchImpl, getCalls, release } = makeDeferredFetch({});

  const p1 = fetchMenu(33, new Date(2026, 1, 4), fetchImpl);
  const p2 = fetchMenu(33, new Date(2026, 1, 4), fetchImpl);
  const p3 = fetchMenu(33, new Date(2026, 1, 4), fetchImpl);
  assert.equal(getCalls(), 1); // all three landed while the first request was still pending

  release();
  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
  assert.deepEqual(r1, r2);
  assert.deepEqual(r2, r3);
});

test("a failed fetch rejects every concurrent waiter but does not poison the cache -- the next call retries fresh", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    if (calls === 1) throw new Error("network down");
    return jsonResponse({});
  }) as typeof fetch;

  const p1 = fetchMenu(34, new Date(2026, 1, 5), fetchImpl);
  const p2 = fetchMenu(34, new Date(2026, 1, 5), fetchImpl); // same key, concurrent with the failing call

  const [s1, s2] = await Promise.allSettled([p1, p2]);
  assert.equal(s1.status, "rejected");
  assert.equal(s2.status, "rejected");
  assert.equal(calls, 1); // dedup held for both waiters against the one failed in-flight request

  const retried = await fetchMenu(34, new Date(2026, 1, 5), fetchImpl);
  assert.deepEqual(retried, []);
  assert.equal(calls, 2); // pending slot was cleared on failure -- this is a fresh call, not a cached failure
});
