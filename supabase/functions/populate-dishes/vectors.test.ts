// Runs shared/vectors/foodpro.json's kind=parse cases against populate-dishes' parseDishRows. Compared
// fields: dishName, hallTid, base nutrition (no %DV), allergens, dietTags. Not compared (the table has
// no columns for them): category, mealPeriod, date, price, ingredients, *Dv. kind=menu is not covered:
// this function fetches and dedupes by name instead of flattening the feed. populate-retail-dishes and
// populate-always-available-dishes parse FoodPro label.aspx / long-menu pages, not foodpro-menu-ajax,
// so they carry no copy of this rule.
//
// Run (repo root): deno test --node-modules-dir=none --allow-env --allow-read=shared/vectors supabase/functions/populate-dishes/vectors.test.ts
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

const { parseDishRows } = await import("./index.ts");
import { defineVectorTests, same } from "../_shared/testing/vectors.ts";

// Cases where parseDishRows disagrees with the vector. Not fixed here: owner decides which side is right.
const KNOWN_DIVERGENT: Record<string, string> = {};

const BASE = ["servingSize", "calories", "caloriesFromFat", "totalFatG", "satFatG", "transFatG", "cholesterolMg", "sodiumMg", "totalCarbG", "dietaryFiberG", "sugarsG", "proteinG"];

defineVectorTests("parseDishRows", "foodpro.json", ["parse"], (c) => {
  // deno-lint-ignore no-explicit-any
  const want = c.expected.map((i: any) => ({
    dishName: i.dishName,
    hallTid: i.hallTid,
    nutrition: Object.fromEntries(BASE.map((k) => [k, i.nutrition[k]])),
    allergens: i.allergens,
    dietTags: i.dietTags,
  }));
  // deno-lint-ignore no-explicit-any
  const got = parseDishRows(c.input.html, c.input.hallTid).map((r: any) => ({
    dishName: r.dishName,
    hallTid: r.hallTid,
    nutrition: Object.fromEntries(BASE.map((k) => [k, r.nutrition[k]])),
    allergens: r.allergens,
    dietTags: r.dietTags,
  }));
  return same(got, want) ? null : `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`;
}, KNOWN_DIVERGENT);
