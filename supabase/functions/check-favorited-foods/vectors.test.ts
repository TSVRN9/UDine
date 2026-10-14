// Runs shared/vectors/favorite-match.json (all kind=match cases) against check-favorited-foods. The
// matching loop is inline in Deno.serve (not callable), so the test rebuilds it exactly: per hall,
// extractDishMealMap over that hall's feed, then `dishes.get(fav.dish_name)` for each favorite. Only
// dish favorites are fed in (favorited_foods holds nothing else). Compared fields: dishName, hallTid,
// mealPeriod, as a set: Deno has no date, and its loop order is favorites-then-halls where the vector
// orders halls-then-favorites (nothing downstream depends on it). Each hall's feed is built from the
// case's menuItems in order, grouped by mealPeriod key then category, the way the wire object is.
//
// Run (repo root): deno test --node-modules-dir=none --allow-env --allow-read=shared/vectors supabase/functions/check-favorited-foods/vectors.test.ts
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

const { extractDishMealMap } = await import("./index.ts");
import { defineVectorTests, same } from "../_shared/testing/vectors.ts";

// Cases where the Deno matching disagrees with the vector. Not fixed here: owner decides which side is right.
const KNOWN_DIVERGENT: Record<string, string> = {};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const key = (m: { dishName: string; hallTid: number; mealPeriod: string }) => JSON.stringify([m.hallTid, m.dishName, m.mealPeriod]);

defineVectorTests("check-favorited-foods", "favorite-match.json", ["match"], (c) => {
  const feeds = new Map<number, Record<string, Record<string, string>>>();
  for (const it of c.input.menuItems) {
    const feed = feeds.get(it.hallTid) ?? {};
    const cats = (feed[it.mealPeriod] ??= {});
    cats[it.category] = (cats[it.category] ?? "") + `<a data-dish-name="${esc(it.dishName)}" href="#inline">x</a>`;
    feeds.set(it.hallTid, feed);
  }
  const hallDishes = new Map([...feeds].map(([tid, feed]) => [tid, extractDishMealMap(feed)]));
  const got: { dishName: string; hallTid: number; mealPeriod: string }[] = [];
  // deno-lint-ignore no-explicit-any
  for (const dishName of new Set(c.input.favorites.filter((f: any) => f.type === "dish").map((f: any) => f.dishName))) { // favorited_foods PK (user_id, dish_name): no duplicates
    for (const [hallTid, dishes] of hallDishes) {
      const mealPeriod = dishes.get(dishName as string);
      if (mealPeriod !== undefined) got.push({ dishName: dishName as string, hallTid, mealPeriod });
    }
  }
  const a = got.map(key).sort();
  const b = c.expected.map(key).sort();
  return same(a, b) ? null : `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`;
}, KNOWN_DIVERGENT);
