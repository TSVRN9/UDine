import assert from "node:assert/strict";
import { test } from "node:test";
import { DINING_HALLS, GRAB_N_GO_TIDS, parseCategoryItems } from "./umassDining.ts";

// Grab 'N Go per-location taxonomy term ids -- discovered live 2026-08-20 for issue #115. Each hall
// has its own dedicated Grab 'N Go page (e.g. https://www.umassdining.com/menu/hampshire-grab-n-go)
// whose `drupal-settings-json` script tag carries `"umass_dining":{"tid":"10715"}` -- distinct from
// both the shared "Grab 'N Go" nav taxonomy term (53, a listing page, not a menu feed) and the 4
// halls' own tids. Cross-checked against GET /uapp/get_infov2, where each "<Hall> Grab 'N Go"
// location's `location_id` matches exactly. See docs/apk-reverse-engineering.md.
test("GRAB_N_GO_TIDS has a distinct, real tid for every dining hall", () => {
  assert.equal(Object.keys(GRAB_N_GO_TIDS).length, DINING_HALLS.length);
  for (const hall of DINING_HALLS) {
    assert.ok(hall.slug in GRAB_N_GO_TIDS, `missing Grab 'N Go tid for ${hall.slug}`);
  }
  assert.deepEqual(GRAB_N_GO_TIDS, {
    worcester: 10667,
    franklin: 10716,
    hampshire: 10715,
    berkshire: 10666,
  });
  // None of these may collide with a regular hall's own tid (1-4) or the shared nav term (53).
  const hallTids = new Set(DINING_HALLS.map((h) => h.tid));
  for (const tid of Object.values(GRAB_N_GO_TIDS)) {
    assert.ok(!hallTids.has(tid));
    assert.notEqual(tid, 53);
  }
});

// Real fragment captured from GET foodpro-menu-ajax?tid=10716&date=09%2F02%2F2026 (Franklin Grab 'N
// Go, lunch, "Grab n'Go Hot " -- note the real feed's trailing space on this category name, unlike
// the halls' own categories). Confirms the existing generic parser (built for the 4 halls) handles
// Grab 'N Go's response shape with zero changes -- same {mealPeriod: {category: html}} envelope and
// the same data-* attribute tags on each <a>, just a different tid and different category names.
const REAL_GNG_FRAGMENT = `<a data-healthfulness="40" data-carbon-list="A" data-ingredient-list="Gardein Breaded Chic&#039;n Pieces (Water, Enriched Wheat Flour)" data-allergens="Gluten, Soy, Corn  , Wheat" data-recipe-webcode="VGN H4 CR1" data-clean-diet-str="Plant Based" data-serving-size="3 oz" data-calories="142" data-calories-from-fat="48" data-total-fat="5.3g" data-total-fat-dv="7" data-sat-fat="0g" data-sat-fat-dv="" data-trans-fat="0g" data-cholesterol="0mg" data-cholesterol_dv="" data-sodium="336.7mg" data-sodium-dv="15" data-total-carb="12.4g" data-total-carb-dv="10" data-dietary-fiber="1.8g" data-dietary-fiber-dv="5" data-sugars="0g" data-sugars-dv="" data-protein="11.5g" data-protein-dv="21" data-dish-name="Baked Meatless Tenders" href="#inline">Baked Meatless Tenders</a>`;

test("parseCategoryItems handles a real Grab 'N Go fragment (trailing-space category, GNG tid) identically to a hall's", () => {
  const [item] = parseCategoryItems(REAL_GNG_FRAGMENT, "Grab n'Go Hot ", "lunch", GRAB_N_GO_TIDS.franklin, "2026-09-02");
  assert.equal(item.dishName, "Baked Meatless Tenders");
  assert.equal(item.category, "Grab n'Go Hot ");
  assert.equal(item.hallTid, GRAB_N_GO_TIDS.franklin);
  assert.equal(item.nutrition.calories, 142);
  assert.equal(item.nutrition.proteinG, 11.5);
  assert.deepEqual(item.dietTags, ["Plant Based"]);
});
