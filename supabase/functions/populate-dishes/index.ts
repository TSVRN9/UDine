// Populates public.dishes, a global read-only nutrition-fact catalog deduplicated by dish name
// (not per hall) -- built for an upcoming mobile local-search feature (stacked follow-on PR). This
// is NOT a per-user consumption log and NOT the per-session menu cache CLAUDE.md's data residency
// table keeps device-only: one shared row per unique dish name, written only by this
// service_role-running scheduled function (see supabase/migrations/20260905120000_create_dishes_
// table.sql and its no-client-write RLS/grant shape, mirroring public.food_sightings).
//
// Intended to run on a schedule (Supabase Cron / pg_cron -> net.http_post), not from client code.
//
// This is a THIRD independent reimplementation of foodpro-menu-ajax's dish-tag parsing (the first
// is shared/src/umassDining.ts's parseCategoryItems, the second is check-favorited-foods/index.ts's
// own extractDishMealMap) -- intentional duplication, already precedented in this codebase: Deno
// can't import @udine/shared (a local workspace package, not published anywhere Deno's npm:/jsr:
// resolvers could reach). Don't try to eliminate it; keep it faithful to the real attribute names
// (see shared/src/umassDining.ts ~line 219 for the canonical list) if that upstream markup ever
// changes.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { HALL_TIDS } from "../_shared/hours.ts";
import { requireCronSecret } from "../_shared/cronAuth.ts";

// UMass Dining's calendar day runs on US/Eastern, not the Edge runtime's clock (UTC on Deno
// Deploy) -- copied verbatim from check-favorited-foods/index.ts's own todayDateParam (Deno
// functions are deployed independently; no cross-function import).
function easternDateParts(): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function todayDateParam(): string {
  const { year, month, day } = easternDateParts();
  return `${month}/${day}/${year}`;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&#039;": "'", "&quot;": '"', "&lt;": "<", "&gt;": ">" };
function decodeEntities(s: string): string {
  return s.replace(/&(amp|#039|quot|lt|gt);/g, (m) => ENTITIES[m] ?? m);
}

function getAttrRaw(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeEntities(match[1]).trim() : undefined;
}

function getAttr(attrs: string, name: string): string {
  return getAttrRaw(attrs, name) ?? "";
}

function num(s: string): number {
  const match = s.match(/-?\d+(\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : 0;
}

function csvList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Base nutrition facts this table has columns for. Deliberately excludes every %DV attribute
 * (data-*-dv) and the retail price span -- public.dishes has no columns for either, per the task
 * spec ("skip *-dv and price attributes entirely"). Shape otherwise matches @udine/shared's
 * NutritionFacts (minus its optional *Dv fields) so shared/src/dishes.ts's client type can just
 * read this jsonb blob as a NutritionFacts value. */
export interface DishNutrition {
  servingSize: string;
  calories: number;
  caloriesFromFat: number;
  totalFatG: number;
  satFatG: number;
  transFatG: number;
  cholesterolMg: number;
  sodiumMg: number;
  totalCarbG: number;
  dietaryFiberG: number;
  sugarsG: number;
  proteinG: number;
}

export interface DishRow {
  dishName: string;
  nutrition: DishNutrition;
  allergens: string[];
  dietTags: string[];
  hallTid: number;
}

/**
 * Parses every `<a data-dish-name="...">` tag out of one category's HTML fragment into a full
 * nutrition-fact DishRow -- a Deno-local port of shared/src/umassDining.ts's parseCategoryItems,
 * stripped to only the fields this table stores (no %DV, no price, no category/mealPeriod/date
 * context -- this table is deduplicated by dish name only, across meal periods and hall tabs).
 */
export function parseDishRows(html: string, hallTid: number): DishRow[] {
  const rows: DishRow[] = [];
  const tagPattern = /<a\s+([^>]*data-dish-name="[^"]*"[^>]*)>([^<]*)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = tagPattern.exec(html)) !== null) {
    const attrs = m[1];
    const dishName = getAttr(attrs, "data-dish-name") || decodeEntities(m[2]).trim();
    if (!dishName) continue;
    rows.push({
      dishName,
      hallTid,
      nutrition: {
        servingSize: getAttr(attrs, "data-serving-size"),
        calories: num(getAttr(attrs, "data-calories")),
        caloriesFromFat: num(getAttr(attrs, "data-calories-from-fat")),
        totalFatG: num(getAttr(attrs, "data-total-fat")),
        satFatG: num(getAttr(attrs, "data-sat-fat")),
        transFatG: num(getAttr(attrs, "data-trans-fat")),
        cholesterolMg: num(getAttr(attrs, "data-cholesterol")),
        sodiumMg: num(getAttr(attrs, "data-sodium")),
        totalCarbG: num(getAttr(attrs, "data-total-carb")),
        dietaryFiberG: num(getAttr(attrs, "data-dietary-fiber")),
        sugarsG: num(getAttr(attrs, "data-sugars")),
        proteinG: num(getAttr(attrs, "data-protein")),
      },
      allergens: csvList(getAttr(attrs, "data-allergens")),
      dietTags: csvList(getAttr(attrs, "data-clean-diet-str")),
    });
  }
  return rows;
}

/**
 * Fetches + parses one hall's whole day of dishes, degrading to an empty map -- not throwing -- on
 * ANY failure (rejected fetch, non-OK response, non-JSON body), same shape as check-favorited-
 * foods/index.ts's fetchHallMenu: one hall's outage must never blank the other 3 halls' worth of
 * dishes for the day.
 *
 * `fetchImpl` defaults to the global fetch; tests inject a stub.
 */
export async function fetchHallDishes(hallTid: number, fetchImpl: typeof fetch = fetch): Promise<Map<string, DishRow>> {
  const url = `https://www.umassdining.com/foodpro-menu-ajax?tid=${hallTid}&date=${encodeURIComponent(todayDateParam())}`;
  const dishes = new Map<string, DishRow>();
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return dishes;
    const data = (await res.json()) as Partial<Record<string, Record<string, string> | undefined>>;
    for (const categories of Object.values(data)) {
      if (!categories) continue;
      for (const html of Object.values(categories)) {
        for (const row of parseDishRows(html, hallTid)) {
          dishes.set(row.dishName, row);
        }
      }
    }
    return dishes;
  } catch (err) {
    console.error(`fetchHallDishes(${hallTid}) failed, degrading to no dishes for this hall:`, err);
    return dishes;
  }
}

/**
 * Fetches every hall's dishes concurrently instead of one at a time. Investigating the 2026-09-11
 * staleness incident (docs/decisions-log.md) found the real, cron-authenticated invocation dying
 * with a bare Gateway Timeout / EDGE_FUNCTION_ERROR (no application-level console.error, i.e. the
 * runtime was killed mid-flight, not our own code throwing) on runs that took 9s+, while a healthy
 * run finished in ~5s -- correlated with, but not conclusively identified as caused by, the 4
 * sequential `await fetchHallDishes()` calls against umassdining.com (an external, sometimes-slow
 * site). The specific platform limit being hit was never pinned down in `function_logs`.
 * Parallelizing the 4 halls cuts worst-case wall time roughly 4x regardless of the exact
 * mechanism -- less wall time is strictly better for a function that's dying slow -- and the same
 * change was applied to check-favorited-foods/index.ts's identical sequential-per-hall loop, which
 * showed the identical failure shape.
 */
export async function fetchAllHallDishes(hallTids: number[], fetchImpl: typeof fetch = fetch): Promise<Map<number, Map<string, DishRow>>> {
  const entries = await Promise.all(hallTids.map(async (tid) => [tid, await fetchHallDishes(tid, fetchImpl)] as const));
  return new Map(entries);
}

/**
 * Builds the Deno.serve response given the merged upsert rows and the upsert's own result.
 * `rows.length === 0` (every hall came back empty) is logged with a distinct message rather than
 * flagged as an HTTP error status: it's ambiguous on its own (a real outage vs. a legitimately
 * dish-less day -- campus closed, semester break) between this and every other event source in this
 * project, so a hard failure status risks a false alarm on a normal quiet day. The log line closes
 * the actual blind spot from the 2026-09-13 entry -- a *run* of consecutive zero-row days is now
 * greppable in `function_logs`, whereas before this a total-outage day produced no signal anywhere.
 */
export function buildPopulateResponse(rows: ReturnType<typeof buildUpsertRows>, upsertError: string | null): Response {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (rows.length === 0) {
    console.warn("populate-dishes: 0 dishes upserted this run (every hall came back empty) -- outage or a genuinely dish-less day, check umassdining.com.");
  }
  if (upsertError) return json({ error: upsertError }, 500);
  return json({ halls: HALL_TIDS.length, dishesUpserted: rows.length });
}

/**
 * Merges each hall's dish map into one dedup'd-by-name map, iterating `hallTids` in order so a
 * name collision across halls is resolved by "last hall processed wins" (acceptable per task
 * spec -- this is a reference catalog, not a per-hall menu). A hall missing from `hallDishes`
 * entirely (every fetch for it failed) is simply skipped.
 */
export function mergeHallDishes(hallTids: number[], hallDishes: Map<number, Map<string, DishRow>>): Map<string, DishRow> {
  const merged = new Map<string, DishRow>();
  for (const tid of hallTids) {
    const dishes = hallDishes.get(tid);
    if (!dishes) continue;
    for (const [name, row] of dishes) {
      merged.set(name, row);
    }
  }
  return merged;
}

/** The row shape public.dishes' upsert expects, one per merged dish, stamped with `updatedAt`. */
export function buildUpsertRows(merged: Map<string, DishRow>, updatedAt: string) {
  return Array.from(merged.values()).map((row) => ({
    dish_name: row.dishName,
    nutrition: row.nutrition,
    allergens: row.allergens,
    diet_tags: row.dietTags,
    last_seen_hall_tid: row.hallTid,
    updated_at: updatedAt,
  }));
}

/**
 * Upserts the merged rows, catching a thrown/rejected exception explicitly. Was previously an
 * unguarded `await ... .upsert(...)` inline in the handler with no try/catch -- a thrown exception
 * there (as opposed to a resolved `{error}` result, which was already handled) produced a bare 500
 * with no log line at all, indistinguishable from a platform-level kill. Extracted to its own
 * function so the catch path is testable with a stub client, without a real Supabase connection.
 */
export async function upsertDishes(supabase: Pick<SupabaseClient, "from">, rows: ReturnType<typeof buildUpsertRows>): Promise<string | null> {
  try {
    const { error } = await supabase.from("dishes").upsert(rows, { onConflict: "dish_name" });
    return error?.message ?? null;
  } catch (err) {
    console.error("populate-dishes: dishes upsert threw:", err);
    return err instanceof Error ? err.message : String(err);
  }
}

Deno.serve(async (req) => {
  // Anyone holding the public anon key passes verify_jwt -- see _shared/cronAuth.ts.
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const hallDishes = await fetchAllHallDishes(HALL_TIDS);

  const merged = mergeHallDishes(HALL_TIDS, hallDishes);
  const rows = buildUpsertRows(merged, new Date().toISOString());

  const upsertError = rows.length > 0 ? await upsertDishes(supabase, rows) : null;

  return buildPopulateResponse(rows, upsertError);
});
