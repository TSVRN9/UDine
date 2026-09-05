// Red-first tests for parseDishRows -- a Deno-local port of shared/src/umassDining.ts's
// parseCategoryItems (see that file's doc comment, ~line 219) that extracts only the fields
// public.dishes has columns for: dish name, base nutrition facts (no %DV, no price), allergens,
// and diet tags. Fixture below is trimmed from shared/src/umassDining.test.ts's own REAL_FRAGMENT
// (a real captured foodpro-menu-ajax response) so the attribute names/shapes match production.
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/populate-dishes/parser.test.ts
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

const { parseDishRows } = await import("./index.ts");

const REAL_FRAGMENT = `<a data-healthfulness="30" data-carbon-list="B" data-ingredient-list="FREIHOFFER&#039;S Country White Bread" data-allergens="Milk, Eggs, Gluten, Soy, Corn  , Wheat" data-recipe-webcode="LPR SUS VGT H3 CR2" data-clean-diet-str="Local, Sustainable, Vegetarian" data-serving-size="1 each" data-calories="127" data-calories-from-fat="26" data-total-fat="2.9g" data-total-fat-dv="4" data-sat-fat="0.5g" data-sat-fat-dv="" data-trans-fat="0g" data-cholesterol="50.9mg" data-cholesterol_dv="" data-sodium="237.2mg" data-sodium-dv="10" data-total-carb="20.4g" data-total-carb-dv="16" data-dietary-fiber="1g" data-dietary-fiber-dv="3" data-sugars="3.4g" data-sugars-dv="" data-protein="5.3g" data-protein-dv="9" data-dish-name="French Toast" href="#inline">French Toast</a><a data-healthfulness="30" data-carbon-list="A" data-ingredient-list="Sweet Plantains" data-allergens="Milk, Eggs, Gluten, Soy, Corn  , Sesame , Wheat" data-recipe-webcode="VGT H3 CR1" data-clean-diet-str="Vegetarian" data-serving-size="1 OZ" data-calories="69" data-calories-from-fat="33" data-total-fat="3.7g" data-total-fat-dv="5" data-sat-fat="0.7g" data-sat-fat-dv="" data-trans-fat="0g" data-cholesterol="0mg" data-cholesterol_dv="" data-sodium="123.2mg" data-sodium-dv="5" data-total-carb="8.9g" data-total-carb-dv="7" data-dietary-fiber="0.2g" data-dietary-fiber-dv="1" data-sugars="8.2g" data-sugars-dv="" data-protein="0.3g" data-protein-dv="0" data-dish-name="Fried Plantain" href="#inline">Fried Plantain</a>`;

Deno.test("parseDishRows extracts every dish in a fragment with full nutrition, allergens, diet tags", () => {
  const rows = parseDishRows(REAL_FRAGMENT, 1);
  if (rows.length !== 2) throw new Error(`expected 2 rows, got ${rows.length}`);

  const toast = rows[0];
  if (toast.dishName !== "French Toast") throw new Error(`expected French Toast, got ${toast.dishName}`);
  if (toast.hallTid !== 1) throw new Error(`expected hallTid 1, got ${toast.hallTid}`);
  if (toast.nutrition.calories !== 127) throw new Error(`expected calories 127, got ${toast.nutrition.calories}`);
  if (toast.nutrition.servingSize !== "1 each") throw new Error(`expected serving size "1 each", got ${toast.nutrition.servingSize}`);
  if (toast.nutrition.proteinG !== 5.3) throw new Error(`expected proteinG 5.3, got ${toast.nutrition.proteinG}`);
  if (toast.nutrition.totalFatG !== 2.9) throw new Error(`expected totalFatG 2.9, got ${toast.nutrition.totalFatG}`);
  if (JSON.stringify(toast.allergens) !== JSON.stringify(["Milk", "Eggs", "Gluten", "Soy", "Corn", "Wheat"])) {
    throw new Error(`unexpected allergens: ${JSON.stringify(toast.allergens)}`);
  }
  if (JSON.stringify(toast.dietTags) !== JSON.stringify(["Local", "Sustainable", "Vegetarian"])) {
    throw new Error(`unexpected diet tags: ${JSON.stringify(toast.dietTags)}`);
  }
  // No %DV field of any kind belongs in this table's nutrition blob -- there's no column for it.
  if ("totalFatDv" in toast.nutrition) throw new Error("nutrition must not include %DV fields");

  if (rows[1].dishName !== "Fried Plantain") throw new Error(`expected Fried Plantain, got ${rows[1].dishName}`);
});

Deno.test("parseDishRows returns an empty array for a fragment with no dish tags", () => {
  const rows = parseDishRows("<h2>Empty Category</h2>", 1);
  if (rows.length !== 0) throw new Error(`expected 0 rows, got ${rows.length}`);
});

Deno.test("parseDishRows treats a missing data-allergens/data-clean-diet-str attribute as an empty list, not a crash", () => {
  const fragment = `<a data-serving-size="1 each" data-calories="100" data-calories-from-fat="0" data-total-fat="1g" data-sat-fat="0g" data-trans-fat="0g" data-cholesterol="0mg" data-sodium="0mg" data-total-carb="0g" data-dietary-fiber="0g" data-sugars="0g" data-protein="0g" data-dish-name="No Extras Dish" href="#inline">No Extras Dish</a>`;
  const rows = parseDishRows(fragment, 3);
  if (rows.length !== 1) throw new Error(`expected 1 row, got ${rows.length}`);
  if (rows[0].allergens.length !== 0) throw new Error(`expected no allergens, got ${JSON.stringify(rows[0].allergens)}`);
  if (rows[0].dietTags.length !== 0) throw new Error(`expected no diet tags, got ${JSON.stringify(rows[0].dietTags)}`);
});
