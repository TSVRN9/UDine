import type { SupabaseClient } from "@supabase/supabase-js";
import type { NutritionFacts } from "./types.ts";

/** One row of public.dishes -- the global, read-only nutrition-fact catalog deduplicated by dish
 * name (see supabase/migrations/20260905120000_create_dishes_table.sql and the populate-dishes
 * Edge Function that writes it). */
export interface DishCatalogEntry {
  dishName: string;
  nutrition: NutritionFacts;
  allergens: string[];
  dietTags: string[];
  updatedAt: string;
}

// MUST match supabase/config.toml's max_rows (also the Supabase cloud default) -- PostgREST caps
// any single response at max_rows with no error at all, it just silently drops rows past it (see
// supabase/functions/_shared/paging.ts's doc comment for the sibling incident, issue #261, that
// bit favorited_foods/profiles on the write side). This table's migration comment says "a few
// thousand dishes at most", comfortably past a single unpaginated page -- fetchDishCatalog pages
// via .range() below, treating a page shorter than PAGE_SIZE as the end-of-data signal, same as
// _shared/paging.ts's fetchAllPages (that module can't be imported from shared/ -- it's Deno-only
// under supabase/functions -- so this is a small, local re-implementation of the same technique).
const PAGE_SIZE = 1000;

/**
 * Bulk/delta fetch of the dish catalog for local caching + search -- deliberately NOT a search
 * function. A per-keystroke search query sent to Supabase would, for a signed-in user, attach
 * their session JWT to a request revealing what food they're about to look up, the exact
 * consumption-adjacent signal CLAUDE.md's data residency policy guards against. Instead this
 * fetches the whole table (or, with `updatedSince`, only rows changed since then, for a cheap
 * incremental sync) and leaves searching it to the caller, against a local cache -- the mobile-side
 * search UI is a separate follow-on task, not built here.
 *
 * Rejects (doesn't swallow) a PostgREST error -- unlike syncDiningHallRanks/syncFavoritedFoods in
 * ./sync.ts, an incremental sync silently treating a failed fetch as "no new rows" would leave a
 * caller's local cache permanently stale with no signal anything went wrong.
 */
export async function fetchDishCatalog(supabase: SupabaseClient, updatedSince?: string): Promise<DishCatalogEntry[]> {
  const rows: DishCatalogEntry[] = [];
  let from = 0;
  for (;;) {
    // .order("dish_name") (the table's own primary key) gives .range() a total, unique sort to
    // page against -- without one, Postgres/PostgREST make no row-order guarantee across separate
    // offset/limit requests, which can silently duplicate or skip rows at a page boundary (see
    // _shared/paging.ts's fetchAllForIds doc comment for the same warning, there against
    // postgrest-js's own PostgrestTransformBuilder.range()).
    let query = supabase.from("dishes").select("dish_name, nutrition, allergens, diet_tags, updated_at").order("dish_name");
    if (updatedSince !== undefined) {
      query = query.gt("updated_at", updatedSince);
    }
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as { dish_name: string; nutrition: NutritionFacts; allergens: string[]; diet_tags: string[]; updated_at: string }[];
    for (const row of page) {
      rows.push({ dishName: row.dish_name, nutrition: row.nutrition, allergens: row.allergens, dietTags: row.diet_tags, updatedAt: row.updated_at });
    }
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}
