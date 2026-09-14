// Populates public.dishes (the same global nutrition catalog populate-dishes/index.ts writes,
// see supabase/migrations/20260905120000_create_dishes_table.sql) from the 24 retail/café
// FoodPro locations that foodpro-menu-ajax's tid system can't reach at all -- Bluewall Grill, the
// various Cafes, etc. populate-dishes only ever sees the 4 residential halls (tid 1-4); a
// retail-exclusive dish (never served at any of the 4 halls) can never appear in public.dishes no
// matter how often that cron runs. This is a deliberate SIBLING function, not a change to
// populate-dishes -- different cadence (weekly, retail menus barely change week to week, vs. daily
// for the halls), different upstream host, and populate-dishes itself is mid-fix for an unrelated
// cron-double-invocation bug in a parallel task -- touching that file here would collide with it.
// See docs/decisions-log.md "Web INA: mirror vs. on-demand, and the `populate-dishes` cron
// (2026-09-13)" and docs/apk-reverse-engineering.md's "FoodPro Web INA" section for the endpoint
// research this builds on.
//
// Source: af-foodpro1.campus.ads.umass.edu's public "Web INA" tool (a different vendor -- Aurora
// Information Systems, not CBORD -- fronting the same FoodPro recipe database). Three endpoints:
//   1. location.aspx -- lists every FoodPro locationNum (28 total: the same 4 halls + 24 retail/
//      café spots). Parsed live here, not hardcoded -- the retail location list can drift.
//   2. longmenu.aspx?...&mealName=<Breakfast|Lunch|Dinner|Late Night> -- one retail location's
//      dishes for one meal period, each carrying a label.aspx link with its RecNum. Confirmed live
//      (2026-09-14): omitting mealName silently defaults to a single period, so all 4 are always
//      requested explicitly. Needs a session cookie primed by one prior location.aspx GET (a cold
//      direct fetch 500s) -- label.aspx does not.
//   3. label.aspx -- the actual Nutrition Facts label for one RecNum. Confirmed permanent/date-
//      independent (dtdate doesn't gate the lookup) and fully stateless (no cookie needed). This is
//      a rendered HTML table ("Calories&nbsp;348" style, not foodpro-menu-ajax's data-* attributes)
//      -- genuinely new parsing logic below, not a reuse of populate-dishes' parseDishRows.
//
// Politeness + Edge Function time budget: a full crawl (measured live 2026-09-14) is 96
// longmenu.aspx requests (24 retail locations x 4 meal periods) surfacing ~394 unique dish names,
// of which ~331 aren't yet in public.dishes (the rest collide with hall dish names populate-dishes
// already wrote -- see fetchExistingDishNames' doc comment for why that's an acceptable, not just
// convenient, thing to skip). Fetching all ~331 label.aspx pages in one run, serially, risks the
// Edge Function's own wall-clock limit (a concern this function's timeout_milliseconds in its
// scheduling migration CANNOT raise -- that setting only bounds how long pg_net waits for a
// response). MAX_LABEL_FETCHES_PER_RUN caps the label.aspx fetches spent per invocation; any
// genuinely-new dish beyond the cap is simply still-not-in-public.dishes, so it's picked up by next
// week's run instead -- self-healing without any cross-invocation state, converging over ~4 weekly
// runs for the initial backlog and staying near-zero afterward (only genuinely new menu items).
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { requireCronSecret } from "../_shared/cronAuth.ts";

const BASE = "https://af-foodpro1.campus.ads.umass.edu/foodpro.net/";
const RESIDENTIAL_HALL_LOCATION_NUMS = new Set([1, 2, 3, 4]); // already covered by populate-dishes
const MEAL_PERIODS = ["Breakfast", "Lunch", "Dinner", "Late Night"];
const MAX_LABEL_FETCHES_PER_RUN = 100;
const REQUEST_DELAY_MS = 50; // be a polite scraper -- this is UMass IT infrastructure, not a CDN
// MUST match supabase/config.toml's max_rows -- PostgREST silently caps a response at this many
// rows, same reasoning as shared/src/dishes.ts's fetchDishCatalog PAGE_SIZE.
const PAGE_SIZE = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&#039;": "'", "&quot;": '"', "&lt;": "<", "&gt;": ">" };
function decodeEntities(s: string): string {
  return s.replace(/&(amp|#039|quot|lt|gt);/g, (m) => ENTITIES[m] ?? m);
}

/** Extracts the leading numeric value from a nutrition string like "17.9g" / "510.3mg" / "348" --
 * same shape as populate-dishes/index.ts's own num() (Deno can't share it across independently-
 * deployed functions, same reasoning as that file's own header comment). */
function num(s: string | undefined): number {
  if (!s) return 0;
  const match = s.match(/-?\d+(\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : 0;
}

export interface RetailLocation {
  locationNum: number;
  /** The exact locationNum string as it appears in location.aspx's own hrefs (e.g. "08", "14") --
   * reused verbatim when building longmenu.aspx URLs, rather than re-deriving/re-padding it. */
  locationNumRaw: string;
  /** The exact (already query-string-encoded, e.g. "Bluewall+-+Grill") locationName value from
   * location.aspx's own hrefs -- reused verbatim rather than re-encoding the display name. */
  hrefLocationName: string;
  displayName: string;
}

/**
 * Parses every retail/café location out of location.aspx's response, EXCLUDING the 4 residential
 * halls (locationNum 01-04) populate-dishes already covers. Live-derived, not hardcoded -- the
 * retail location list can drift (new cafés open, old ones close).
 */
export function parseRetailLocations(html: string): RetailLocation[] {
  const rows: RetailLocation[] = [];
  const re = /<a href='shortmenu\.aspx\?sName=%60&locationNum=(\d+)&locationName=([^&]+)&naFlag=1'>([^<]+)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const locationNum = Number(m[1]);
    if (RESIDENTIAL_HALL_LOCATION_NUMS.has(locationNum)) continue;
    rows.push({ locationNum, locationNumRaw: m[1], hrefLocationName: m[2], displayName: decodeEntities(m[3]).trim() });
  }
  return rows;
}

export interface DiscoveredDish {
  dishName: string;
  /** The relative label.aspx?... path+query verbatim from longmenu.aspx's own href -- reused as-is
   * (base URL + this) rather than re-deriving locationNum/locationName/RecNumAndPort params. */
  labelPath: string;
}

/**
 * Parses every dish row out of one longmenu.aspx response (one location, one meal period). Scoped
 * to `<div class='longmenucoldispname'>` blocks specifically, so an unrelated label.aspx-shaped
 * href elsewhere on the page (none observed live, but cheap to guard) can't be picked up.
 */
export function parseLongMenuDishes(html: string): DiscoveredDish[] {
  const rows: DiscoveredDish[] = [];
  const re = /<div class='longmenucoldispname'>[\s\S]*?<a href='(label\.aspx\?[^']+)'[^>]*>([^<]*)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const dishName = decodeEntities(m[2]).trim();
    if (!dishName) continue;
    rows.push({ dishName, labelPath: decodeEntities(m[1]) });
  }
  return rows;
}

/** Base nutrition facts public.dishes has columns for -- same shape as populate-dishes/index.ts's
 * DishNutrition (mirrored field names, see that file's own doc comment for why the shape matches
 * shared/src/types.ts's NutritionFacts). */
export interface RetailDishNutrition {
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

/** Finds "<label>&nbsp;(</b>)?</font> ... <font ...>value</font>" -- the layout label.aspx uses for
 * every nutrition-fact row except Calories/Calories from Fat (see below), regardless of whether the
 * label itself is bolded or has leading &nbsp; padding before it (both real, observed live). */
function labelledValue(html: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}&nbsp;(?:</b>)?</font>\\s*<font[^>]*>([^<]+)</font>`, "i");
  const m = html.match(re);
  return m ? decodeEntities(m[1]).trim() : undefined;
}

/**
 * Parses label.aspx's rendered Nutrition Facts HTML table. Genuinely new parsing logic -- this
 * markup shares nothing with foodpro-menu-ajax's data-* attributes populate-dishes' parseDishRows
 * expects. Returns null (skip, don't crash the run) when the page doesn't even carry a Calories
 * figure -- a stale/expired RecNum renders as a mostly-empty page, not an HTTP error.
 */
export function parseLabelNutrition(html: string): RetailDishNutrition | null {
  const caloriesMatch = html.match(/Calories&nbsp;(\d+(?:\.\d+)?)/);
  if (!caloriesMatch) return null;
  const caloriesFromFatMatch = html.match(/Calories from Fat&nbsp;(\d+(?:\.\d+)?)/);
  return {
    servingSize: labelledValue(html, "Serving Size") ?? "",
    calories: Number.parseFloat(caloriesMatch[1]),
    caloriesFromFat: caloriesFromFatMatch ? Number.parseFloat(caloriesFromFatMatch[1]) : 0,
    totalFatG: num(labelledValue(html, "Total Fat")),
    satFatG: num(labelledValue(html, "Sat. Fat")),
    transFatG: num(labelledValue(html, "Trans Fat")),
    cholesterolMg: num(labelledValue(html, "Cholesterol")),
    sodiumMg: num(labelledValue(html, "Sodium")),
    totalCarbG: num(labelledValue(html, "Tot. Carb.")),
    dietaryFiberG: num(labelledValue(html, "Dietary Fiber")),
    sugarsG: num(labelledValue(html, "Sugars")),
    proteinG: num(labelledValue(html, "Protein")),
  };
}

/** label.aspx's allergen line ("ALLERGENS:&nbsp;&nbsp;<span class="labelallergensvalue">Milk,
 * Gluten, ...</span>"), comma-split same as populate-dishes' csvList. No diet-tag equivalent exists
 * on this page (unlike foodpro-menu-ajax's data-clean-diet-str) -- dietTags stays empty, matching
 * the dishes table's own `not null default '{}'`. */
export function parseLabelAllergens(html: string): string[] {
  const m = html.match(/labelallergensvalue">([^<]*)</);
  if (!m) return [];
  return decodeEntities(m[1])
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A stable per-location numeric hallTid for a retail dish's last_seen_hall_tid, always negative so
 * it can never collide with a real hall tid (1-4) -- same "not a real hall tid, but needs one to key
 * by" precedent mobile/src/lib/cafeMenu.ts's syntheticHallTidForName already established, but
 * simpler here: locationNum is already a stable, unique, real numeric id, so negating it directly is
 * enough (no hashing needed). */
export function retailLocationHallTid(locationNum: number): number {
  return -locationNum;
}

export function buildRetailUpsertRow(dishName: string, nutrition: RetailDishNutrition, allergens: string[], hallTid: number, updatedAt: string) {
  return {
    dish_name: dishName,
    nutrition,
    allergens,
    diet_tags: [] as string[],
    last_seen_hall_tid: hallTid,
    updated_at: updatedAt,
  };
}

/** Reduces every Set-Cookie value from location.aspx's response to one Cookie request header,
 * dropping each cookie's own attributes (path, HttpOnly, ...) -- verified live 2026-09-14 that
 * longmenu.aspx accepts exactly this replay and 500s without it. */
export function cookieHeaderFromSetCookie(setCookieValues: string[]): string {
  return setCookieValues.map((c) => c.split(";")[0]).join("; ");
}

/** Every dish_name already in public.dishes -- checked so a label.aspx fetch is only ever spent on
 * a genuinely new dish name. NOTE (deliberate, not an oversight): populate-dishes runs DAILY and
 * upserts on the same dish_name key, so a retail dish whose name happens to collide with a hall
 * dish (e.g. "Cheeseburger", "French Fries" -- common, not rare) will have its row re-overwritten
 * by the hall's own nutrition every morning regardless of what this weekly job ever wrote for it,
 * and this skip-list means this job won't try to re-win that name back either. That's acceptable:
 * the gap this function fixes is retail-EXCLUSIVE dishes (never served at any of the 4 halls), and
 * those never collide by construction. */
async function fetchExistingDishNames(supabase: SupabaseClient): Promise<Set<string>> {
  const names = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from("dishes").select("dish_name").range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as { dish_name: string }[];
    for (const row of page) names.add(row.dish_name);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return names;
}

Deno.serve(async (req) => {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  // Unlike populate-dishes' fetchHallDishes (one hall's outage degrades silently, by design, since
  // the other 3 halls' data must still land), a location.aspx failure here means we don't even know
  // what to crawl -- that's unambiguous breakage, not a quiet "nothing new this week", so it's a
  // real error response, not a swallowed-to-200.
  let locationHtml: string;
  let setCookieValues: string[];
  try {
    const res = await fetch(`${BASE}location.aspx`);
    if (!res.ok) return json(502, { error: `location.aspx returned ${res.status}` });
    locationHtml = await res.text();
    setCookieValues = res.headers.getSetCookie?.() ?? [];
  } catch (err) {
    return json(502, { error: `location.aspx fetch failed: ${err}` });
  }

  const locations = parseRetailLocations(locationHtml);
  if (locations.length === 0) {
    return json(502, { error: "parsed zero retail locations from location.aspx -- markup likely changed" });
  }

  const cookieHeader = cookieHeaderFromSetCookie(setCookieValues);
  const existingNames = await fetchExistingDishNames(supabase);

  // First-seen-wins across (location x meal period) -- the same dish name can appear at more than
  // one location/meal with a different per-recipe RecNum (confirmed live, "RecNum is per-hall-
  // recipe, not global" per docs/apk-reverse-engineering.md); we only need ONE label.aspx lookup
  // per unique name, since public.dishes dedupes by name too.
  const discovered = new Map<string, { labelPath: string; locationNum: number }>();
  for (const loc of locations) {
    for (const meal of MEAL_PERIODS) {
      const url = `${BASE}longmenu.aspx?sName=%60&locationNum=${loc.locationNumRaw}&locationName=${loc.hrefLocationName}&naFlag=1&mealName=${encodeURIComponent(meal)}`;
      try {
        const res = await fetch(url, { headers: { Cookie: cookieHeader } });
        if (res.ok) {
          const html = await res.text();
          for (const dish of parseLongMenuDishes(html)) {
            if (!discovered.has(dish.dishName)) discovered.set(dish.dishName, { labelPath: dish.labelPath, locationNum: loc.locationNum });
          }
        }
      } catch (err) {
        // One (location, meal period) outage shouldn't blank the rest of the crawl.
        console.error(`populate-retail-dishes: longmenu.aspx failed for location ${loc.locationNumRaw} ${meal}:`, err);
      }
      await sleep(REQUEST_DELAY_MS);
    }
  }

  const updatedAt = new Date().toISOString();
  const rows: ReturnType<typeof buildRetailUpsertRow>[] = [];
  let labelFetches = 0;
  for (const [dishName, info] of discovered) {
    if (existingNames.has(dishName)) continue;
    if (labelFetches >= MAX_LABEL_FETCHES_PER_RUN) break; // remaining new names picked up next week
    labelFetches++;
    try {
      const res = await fetch(`${BASE}${info.labelPath}`);
      if (res.ok) {
        const html = await res.text();
        const nutrition = parseLabelNutrition(html);
        if (nutrition) {
          rows.push(buildRetailUpsertRow(dishName, nutrition, parseLabelAllergens(html), retailLocationHallTid(info.locationNum), updatedAt));
        }
      }
    } catch (err) {
      console.error(`populate-retail-dishes: label.aspx failed for "${dishName}":`, err);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("dishes").upsert(rows, { onConflict: "dish_name" });
    if (error) return json(500, { error: error.message });
  }

  return json(200, { retailLocations: locations.length, dishesDiscovered: discovered.size, newDishesUpserted: rows.length });
});
