// Red-first tests for the two genuinely NEW pieces of logic in this function (everything else --
// parseLongMenuDishes/parseLabelNutrition/parseLabelAllergens/cookieHeaderFromSetCookie -- is a
// byte-for-byte duplicate of populate-retail-dishes/index.ts's own already-tested parsers, covered
// by parser.test.ts against fresh real fixtures instead of re-litigating markup already proven
// there):
//
//   1. matchCuratedDishes -- filters one hall's longmenu.aspx discoveries down to just the curated
//      always-available dish names (shared/src/alwaysAvailableStations.ts), first-seen-wins.
//   2. buildAlwaysAvailableUpsertRow -- unlike populate-retail-dishes' buildRetailUpsertRow, which
//      NEGATES locationNum into a synthetic hallTid outside 1-4 (retail locations aren't real
//      halls), this function's hallTid IS a real hall tid (1-4) and must be written through
//      UNCHANGED -- that's the whole point of reusing last_seen_hall_tid for its existing meaning
//      instead of inventing new semantics (see docs/briefs/foodpro-menu-expansion.md task 1).
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/populate-always-available-dishes/rows.test.ts
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

const { matchCuratedDishes, buildAlwaysAvailableUpsertRow } = await import("./index.ts");

Deno.test("matchCuratedDishes keeps only discovered dishes whose name is in the curated set, dropping everything else", () => {
  const discovered = [
    { dishName: "Cheese Pizza", labelPath: "label.aspx?...=135015*1" },
    { dishName: "Chicken Tenders", labelPath: "label.aspx?...=999999*1" }, // not a curated always-available dish
    { dishName: "Pepperoni Pizza", labelPath: "label.aspx?...=135016*1" },
  ];
  const curated = new Set(["Cheese Pizza", "Pepperoni Pizza", "Vegetable Pizza"]);
  const matched = matchCuratedDishes(discovered, curated);
  if (matched.size !== 2) throw new Error(`expected 2 matches, got ${matched.size}: ${JSON.stringify([...matched.keys()])}`);
  if (matched.get("Cheese Pizza") !== "label.aspx?...=135015*1") throw new Error("wrong labelPath for Cheese Pizza");
  if (matched.get("Pepperoni Pizza") !== "label.aspx?...=135016*1") throw new Error("wrong labelPath for Pepperoni Pizza");
  if (matched.has("Chicken Tenders")) throw new Error("an uncurated dish leaked through");
});

Deno.test("matchCuratedDishes is first-seen-wins when the same dish name is discovered twice (e.g. across two meal periods)", () => {
  const discovered = [
    { dishName: "Cheese Pizza", labelPath: "label.aspx?meal=Lunch&...=135015*1" },
    { dishName: "Cheese Pizza", labelPath: "label.aspx?meal=Dinner&...=135015*1" },
  ];
  const matched = matchCuratedDishes(discovered, new Set(["Cheese Pizza"]));
  if (matched.get("Cheese Pizza") !== "label.aspx?meal=Lunch&...=135015*1") {
    throw new Error(`expected the first-seen labelPath to win, got ${matched.get("Cheese Pizza")}`);
  }
});

Deno.test("matchCuratedDishes returns an empty map when nothing discovered matches the curated set (station absent this run)", () => {
  const matched = matchCuratedDishes([{ dishName: "Chicken Tenders", labelPath: "label.aspx?...=1" }], new Set(["Cheese Pizza"]));
  if (matched.size !== 0) throw new Error(`expected 0 matches, got ${matched.size}`);
});

Deno.test("buildAlwaysAvailableUpsertRow writes the REAL hall tid through unchanged -- no retail-style negation", () => {
  const nutrition = {
    servingSize: "1 OZ",
    calories: 91,
    caloriesFromFat: 0,
    totalFatG: 8.1,
    satFatG: 5.1,
    transFatG: 0,
    cholesterolMg: 25.3,
    sodiumMg: 506.3,
    totalCarbG: 1,
    dietaryFiberG: 0,
    sugarsG: 1,
    proteinG: 5.1,
  };
  const row = buildAlwaysAvailableUpsertRow("American Cheese", nutrition, ["Milk"], 1, "2026-09-14T12:00:00.000Z");
  if (row.dish_name !== "American Cheese") throw new Error(`unexpected dish_name: ${row.dish_name}`);
  // The critical assertion: hallTid 1 stays 1 (a real Worcester tid), never negated to -1 the way
  // populate-retail-dishes' retailLocationHallTid would for a synthetic retail location.
  if (row.last_seen_hall_tid !== 1) throw new Error(`expected last_seen_hall_tid 1 (unchanged), got ${row.last_seen_hall_tid}`);
  if (row.updated_at !== "2026-09-14T12:00:00.000Z") throw new Error(`unexpected updated_at: ${row.updated_at}`);
  if ((row.nutrition as { calories: number }).calories !== 91) throw new Error("nutrition payload not carried through");
  if (JSON.stringify(row.allergens) !== JSON.stringify(["Milk"])) throw new Error(`unexpected allergens: ${JSON.stringify(row.allergens)}`);
  if (!Array.isArray(row.diet_tags) || row.diet_tags.length !== 0) throw new Error(`expected empty diet_tags, got ${JSON.stringify(row.diet_tags)}`);
});

Deno.test("buildAlwaysAvailableUpsertRow accepts every real hall tid 1-4 unchanged", () => {
  const nutrition = {
    servingSize: "1 slice",
    calories: 250,
    caloriesFromFat: 80,
    totalFatG: 9,
    satFatG: 4,
    transFatG: 0,
    cholesterolMg: 20,
    sodiumMg: 500,
    totalCarbG: 30,
    dietaryFiberG: 2,
    sugarsG: 3,
    proteinG: 11,
  };
  for (const hallTid of [1, 2, 3, 4]) {
    const row = buildAlwaysAvailableUpsertRow("Cheese Pizza", nutrition, [], hallTid, "2026-09-14T12:00:00.000Z");
    if (row.last_seen_hall_tid !== hallTid) throw new Error(`expected ${hallTid}, got ${row.last_seen_hall_tid}`);
  }
});
