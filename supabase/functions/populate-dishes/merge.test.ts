// Red-first tests for mergeHallDishes/buildUpsertRows -- the cross-hall merge and the row shape
// sent to the `dishes` upsert. Spec: dedup by dish name across all 4 halls, LAST hall processed
// wins on a name collision (acceptable per task spec), and the upsert payload sets updated_at to
// "now" for every row.
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/populate-dishes/merge.test.ts
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

import type { DishRow } from "./index.ts";
const { mergeHallDishes, buildUpsertRows } = await import("./index.ts");

function dish(name: string, hallTid: number, calories: number): DishRow {
  return {
    dishName: name,
    hallTid,
    nutrition: {
      servingSize: "1 each",
      calories,
      caloriesFromFat: 0,
      totalFatG: 0,
      satFatG: 0,
      transFatG: 0,
      cholesterolMg: 0,
      sodiumMg: 0,
      totalCarbG: 0,
      dietaryFiberG: 0,
      sugarsG: 0,
      proteinG: 0,
    },
    allergens: [],
    dietTags: [],
  };
}

Deno.test("mergeHallDishes: dishes unique to each hall all survive", () => {
  const hallDishes = new Map<number, Map<string, DishRow>>([
    [1, new Map([["Chicken Tenders", dish("Chicken Tenders", 1, 200)]])],
    [2, new Map([["Falafel", dish("Falafel", 2, 150)]])],
  ]);
  const merged = mergeHallDishes([1, 2], hallDishes);
  if (merged.size !== 2) throw new Error(`expected 2 dishes, got ${merged.size}`);
  if (merged.get("Chicken Tenders")?.hallTid !== 1) throw new Error("Chicken Tenders should be from hall 1");
  if (merged.get("Falafel")?.hallTid !== 2) throw new Error("Falafel should be from hall 2");
});

Deno.test("mergeHallDishes: on a name collision, the LAST hall processed (by hallTids order) wins", () => {
  const hallDishes = new Map<number, Map<string, DishRow>>([
    [1, new Map([["Cheese Pizza", dish("Cheese Pizza", 1, 300)]])],
    [4, new Map([["Cheese Pizza", dish("Cheese Pizza", 4, 350)]])],
  ]);
  const merged = mergeHallDishes([1, 4], hallDishes);
  if (merged.size !== 1) throw new Error(`expected 1 dish, got ${merged.size}`);
  const pizza = merged.get("Cheese Pizza");
  if (pizza?.hallTid !== 4) throw new Error(`expected hall 4 (last processed) to win, got hall ${pizza?.hallTid}`);
  if (pizza?.nutrition.calories !== 350) throw new Error(`expected hall 4's calories (350), got ${pizza?.nutrition.calories}`);
});

Deno.test("mergeHallDishes: a hall missing entirely from the map (e.g. every fetch for it failed) is skipped, not an error", () => {
  const hallDishes = new Map<number, Map<string, DishRow>>([[1, new Map([["Chicken Tenders", dish("Chicken Tenders", 1, 200)]])]]);
  const merged = mergeHallDishes([1, 2, 3, 4], hallDishes);
  if (merged.size !== 1) throw new Error(`expected 1 dish, got ${merged.size}`);
});

Deno.test("buildUpsertRows: maps each merged dish to a dishes-table row, stamping updated_at with the given timestamp", () => {
  const merged = new Map<string, DishRow>([["Chicken Tenders", dish("Chicken Tenders", 3, 200)]]);
  const rows = buildUpsertRows(merged, "2026-09-05T12:00:00.000Z");
  if (rows.length !== 1) throw new Error(`expected 1 row, got ${rows.length}`);
  const row = rows[0];
  if (row.dish_name !== "Chicken Tenders") throw new Error(`expected dish_name Chicken Tenders, got ${row.dish_name}`);
  if (row.last_seen_hall_tid !== 3) throw new Error(`expected last_seen_hall_tid 3, got ${row.last_seen_hall_tid}`);
  if (row.updated_at !== "2026-09-05T12:00:00.000Z") throw new Error(`expected stamped updated_at, got ${row.updated_at}`);
  if ((row.nutrition as { calories: number }).calories !== 200) throw new Error("nutrition payload not carried through");
  if (!Array.isArray(row.allergens) || !Array.isArray(row.diet_tags)) throw new Error("allergens/diet_tags must be arrays");
});

Deno.test("buildUpsertRows: an empty merged map produces an empty row list (no upsert call needed)", () => {
  const rows = buildUpsertRows(new Map(), "2026-09-05T12:00:00.000Z");
  if (rows.length !== 0) throw new Error(`expected 0 rows, got ${rows.length}`);
});
