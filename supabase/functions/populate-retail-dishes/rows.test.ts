// Red-first tests for retailLocationHallTid + buildRetailUpsertRow -- the row shape sent to the
// SAME public.dishes upsert populate-dishes/index.ts writes (onConflict: "dish_name").
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/populate-retail-dishes/rows.test.ts
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

const { retailLocationHallTid, buildRetailUpsertRow } = await import("./index.ts");

Deno.test("retailLocationHallTid negates the locationNum, always producing a value outside the real 1-4 hall range", () => {
  if (retailLocationHallTid(14) !== -14) throw new Error(`expected -14, got ${retailLocationHallTid(14)}`);
  if (retailLocationHallTid(23) !== -23) throw new Error(`expected -23, got ${retailLocationHallTid(23)}`);
  for (const locationNum of [8, 13, 14, 20, 21, 22, 23, 25, 28, 30, 40, 97]) {
    const tid = retailLocationHallTid(locationNum);
    if (tid >= 1 && tid <= 4) throw new Error(`retailLocationHallTid(${locationNum}) = ${tid} collides with a real hall tid`);
  }
});

Deno.test("buildRetailUpsertRow maps a discovered dish to a dishes-table row, stamping updated_at and the given hallTid", () => {
  const nutrition = {
    servingSize: "4 oz",
    calories: 172,
    caloriesFromFat: 1.2,
    totalFatG: 6.2,
    satFatG: 0.5,
    transFatG: 0,
    cholesterolMg: 0,
    sodiumMg: 155.1,
    totalCarbG: 25.2,
    dietaryFiberG: 1.8,
    sugarsG: 1.9,
    proteinG: 3.4,
  };
  const row = buildRetailUpsertRow("African Soul Rice Salad", nutrition, ["Gluten", "Soy", "Wheat"], -23, "2026-09-14T12:00:00.000Z");
  if (row.dish_name !== "African Soul Rice Salad") throw new Error(`unexpected dish_name: ${row.dish_name}`);
  if (row.last_seen_hall_tid !== -23) throw new Error(`unexpected last_seen_hall_tid: ${row.last_seen_hall_tid}`);
  if (row.updated_at !== "2026-09-14T12:00:00.000Z") throw new Error(`unexpected updated_at: ${row.updated_at}`);
  if ((row.nutrition as { calories: number }).calories !== 172) throw new Error("nutrition payload not carried through");
  if (JSON.stringify(row.allergens) !== JSON.stringify(["Gluten", "Soy", "Wheat"])) throw new Error(`unexpected allergens: ${JSON.stringify(row.allergens)}`);
  // No diet-tag equivalent exists on label.aspx (unlike foodpro-menu-ajax's data-clean-diet-str) --
  // always empty, matching the dishes table's own `not null default '{}'`.
  if (!Array.isArray(row.diet_tags) || row.diet_tags.length !== 0) throw new Error(`expected empty diet_tags, got ${JSON.stringify(row.diet_tags)}`);
});
