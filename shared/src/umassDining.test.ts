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
