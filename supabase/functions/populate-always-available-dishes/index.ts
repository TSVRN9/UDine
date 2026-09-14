// Populates public.dishes (supabase/migrations/20260905120000_create_dishes_table.sql) with the
// "always-available" station catalog -- Salad Bar / Yogurt Bar / Pizza -- for the 4 residential
// halls. See docs/briefs/foodpro-menu-expansion.md task 1 and docs/design/canvas.json's
// "unlisted-station-logic" annotation for the full design record: these stations are NEVER
// itemized on foodpro-menu-ajax (the daily tid-keyed feed populate-dishes/index.ts reads) at all --
// confirmed live 2026-09-14 across all 4 halls, all 4 meal periods -- so populate-dishes can never
// discover them no matter how often it runs.
//
// SIBLING function, not a change to populate-dishes or populate-retail-dishes:
//   - populate-dishes only ever sees what foodpro-menu-ajax itemizes, which structurally excludes
//     these stations (the whole reason this function needs to exist).
//   - populate-retail-dishes crawls a DISCOVERED, changing set of 24 retail/café locations and
//     negates locationNum into a synthetic hallTid outside 1-4 (RESIDENTIAL_HALL_LOCATION_NUMS is
//     explicitly excluded there -- "already covered by populate-dishes", which was true before this
//     function existed and is now covered by THIS function instead). This function is the opposite
//     shape: a small, hand-curated, rarely-changing dish list for exactly the 4 residential halls,
//     written with their REAL hall tid (1-4) in last_seen_hall_tid -- reusing that column for its
//     existing "which hall this row belongs to" meaning, not inventing new semantics. Mixing the two
//     into one function would blur that real-vs-synthetic hallTid distinction for no benefit.
//
// The curated dish list below is a DUPLICATE of shared/src/alwaysAvailableStations.ts -- Deno can't
// import @udine/shared, a local workspace package (see populate-dishes/index.ts's own header
// comment for the established precedent/workaround). shared/src/alwaysAvailableStations.ts is
// CANONICAL; this is a small, hand-curated list, not a generated one, so keep the two in sync by
// hand when the real station lineup changes (re-curate from af-foodpro1's longmenu.aspx, see that
// file's own header for how).
//
// Source + parsing: reuses populate-retail-dishes/index.ts's exact technique (Deno can't share code
// across independently-deployed functions either, same reasoning) -- af-foodpro1.campus.ads.umass.edu's
// longmenu.aspx (per-hall, per-meal-period dish listing with a label.aspx link per dish) to discover
// each curated dish's current RecNum, then label.aspx for the actual Nutrition Facts. Dish names are
// the join key against the curated list (public.dishes' own dedup key, see that migration's header
// comment) -- RecNums aren't stable to hardcode, so this still crawls longmenu.aspx rather than
// baking label.aspx paths into the curated list directly.
//
// Cadence: WEEKLY (see the scheduling migration's own header for the exact slot) -- this is the same
// upstream host and the same "standing menu barely changes week to week" reasoning
// populate-retail-dishes already established, and unlike that function there's no discovery backlog
// to clear (the dish list is fixed and small, ~60 rows total), so a single run always covers
// everything -- no MAX_FETCHES_PER_RUN cap, no cross-run batching, needed.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { requireCronSecret } from "../_shared/cronAuth.ts";

const BASE = "https://af-foodpro1.campus.ads.umass.edu/foodpro.net/";
const MEAL_PERIODS = ["Breakfast", "Lunch", "Dinner", "Late Night"];
const REQUEST_DELAY_MS = 50; // be a polite scraper -- this is UMass IT infrastructure, not a CDN
const CRAWL_CONCURRENCY = 4; // see runPool's own doc comment for why a bounded pool, not full fan-out

// -- Curated catalog: DUPLICATE of shared/src/alwaysAvailableStations.ts, kept in sync by hand. See
// that file's own header for the full curation record (captured live 2026-09-14) and why Yogurt Bar
// has no entries.
interface AlwaysAvailableStation {
  station: string;
  hallTid: number;
  dishNames: string[];
}
const ALWAYS_AVAILABLE_STATIONS: AlwaysAvailableStation[] = [
  {
    station: "Salad Bar",
    hallTid: 1, // Worcester
    dishNames: [
      "American Cheese",
      "Broccoli Flowerettes",
      "Carrots Sticks",
      "Celery Sticks",
      "Cucumbers",
      "Grape Tomatoes",
      "Hard Boiled Egg",
      "Hummus",
      "Ketchup",
      "Lentils",
      "Lettuce",
      "Little Leaf Spring Mix",
      "Local Pickle Chips",
      "Mayonnaise",
      "Mixed Peppers",
      "Pulmuone Tofu",
      "Quinoa",
      "Red Onions",
      "Shredded Cheddar Cheese",
      "Tomato Slices",
    ],
  },
  { station: "Pizza", hallTid: 1, dishNames: ["Cheese Pizza", "Meat Lover's Pizza", "Pepperoni Pizza", "Vegetable Pizza", "White Cheese Pizza"] },
  { station: "Pizza", hallTid: 2, dishNames: ["Cheese Pizza", "Pepperoni Pizza"] }, // Franklin -- no Salad Bar station here
  { station: "Pizza", hallTid: 3, dishNames: ["Cheese Pizza", "Pepperoni Pizza", "Vegetable Pizza"] }, // Hampshire -- no Salad Bar station here
  {
    station: "Salad Bar",
    hallTid: 4, // Berkshire
    dishNames: [
      "Alfalfa Sprouts",
      "Artichoke Spinach Pasta Salad",
      "Beans Black",
      "Carrots Sticks",
      "Celery Sticks",
      "Cheddar Cheese",
      "Chickpea Salad w/Teardrop Peppers & Artichoke Hearts",
      "Cucumbers",
      "Fat Free Cottage Cheese",
      "Golden Raisins",
      "Grape Tomatoes",
      "Green Peppers",
      "Homemade Red Pepper Hummus",
      "Italian Tuna Salad",
      "Kidney Beans",
      "Marinated Artichoke Hearts",
      "Onions",
      "Pepperoncini",
      "Peppers Red Roasted",
      "Pita Chips",
      "Pulmuone Tofu",
      "Pumpkin Seeds",
      "Roasted Pepper, Olive & Feta Salad",
      "Romaine Lettuce",
      "Sliced Eggs",
      "Sliced Mushrooms",
      "Sliced Olives Black",
      "Spinach Leaves",
      "Sunflower Seeds",
    ],
  },
  { station: "Pizza", hallTid: 4, dishNames: ["Cheese Pizza", "Pepperoni Pizza", "Vegetable Pizza"] },
];

/** The 4 residential halls' fixed longmenu.aspx identity -- unlike populate-retail-dishes' retail
 * locations, these never drift (tid 1-4 is hardcoded everywhere else in this codebase, e.g.
 * supabase/functions/_shared/hours.ts's HALL_TIDS), so there's no need to discover them from
 * location.aspx the way that function discovers its 24 retail/café rows. locationNumRaw/
 * hrefLocationName values confirmed live 2026-09-14 against location.aspx's own hrefs. */
const HALLS: { hallTid: number; locationNumRaw: string; hrefLocationName: string }[] = [
  { hallTid: 1, locationNumRaw: "01", hrefLocationName: "Worcester+Dining+Commons" },
  { hallTid: 2, locationNumRaw: "02", hrefLocationName: "Franklin+Dining+Commons" },
  { hallTid: 3, locationNumRaw: "03", hrefLocationName: "Hampshire+Dining+Commons" },
  { hallTid: 4, locationNumRaw: "04", hrefLocationName: "+Berkshire+Dining+Commons" },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Same bounded worker-pool shape as populate-retail-dishes/index.ts's runPool (duplicated, not
 * imported -- see this file's own header comment). */
export async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function lane(): Promise<void> {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, lane));
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&#039;": "'", "&quot;": '"', "&lt;": "<", "&gt;": ">" };
function decodeEntities(s: string): string {
  return s.replace(/&(amp|#039|quot|lt|gt);/g, (m) => ENTITIES[m] ?? m);
}

function num(s: string | undefined): number {
  if (!s) return 0;
  const match = s.match(/-?\d+(\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : 0;
}

export interface DiscoveredDish {
  dishName: string;
  labelPath: string;
}

/** Identical to populate-retail-dishes/index.ts's own parseLongMenuDishes (duplicated, see this
 * file's header comment) -- same longmenu.aspx markup family, confirmed live against a residential
 * hall page (parser.test.ts). */
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

export interface AlwaysAvailableDishNutrition {
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

function labelledValue(html: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}&nbsp;(?:</b>)?</font>\\s*<font[^>]*>([^<]+)</font>`, "i");
  const m = html.match(re);
  return m ? decodeEntities(m[1]).trim() : undefined;
}

/** Identical to populate-retail-dishes/index.ts's own parseLabelNutrition (duplicated, see this
 * file's header comment). */
export function parseLabelNutrition(html: string): AlwaysAvailableDishNutrition | null {
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

/** Identical to populate-retail-dishes/index.ts's own parseLabelAllergens (duplicated, see this
 * file's header comment). No diet-tag equivalent exists on label.aspx -- dietTags stays empty. */
export function parseLabelAllergens(html: string): string[] {
  const m = html.match(/labelallergensvalue">([^<]*)</);
  if (!m) return [];
  return decodeEntities(m[1])
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Identical to populate-retail-dishes/index.ts's own cookieHeaderFromSetCookie (duplicated, see
 * this file's header comment) -- longmenu.aspx needs a session cookie primed by one prior
 * location.aspx GET the same way for a residential hall as for a retail location. */
export function cookieHeaderFromSetCookie(setCookieValues: string[]): string {
  return setCookieValues.map((c) => c.split(";")[0]).join("; ");
}

/** Filters one hall's longmenu.aspx discoveries down to just the curated always-available dish
 * names for that hall, first-seen-wins on a repeat name (e.g. the same dish discovered again at a
 * later meal period) -- only ONE label.aspx lookup is ever spent per dish. Anything discovered that
 * ISN'T in the curated set (an ordinary meal-varying dish sharing a longmenu.aspx page with the
 * always-available stations) is simply dropped: this function only ever writes the hand-curated
 * list, never expands it on its own. */
export function matchCuratedDishes(discovered: DiscoveredDish[], curatedNames: Set<string>): Map<string, string> {
  const matched = new Map<string, string>();
  for (const dish of discovered) {
    if (curatedNames.has(dish.dishName) && !matched.has(dish.dishName)) {
      matched.set(dish.dishName, dish.labelPath);
    }
  }
  return matched;
}

/** Builds one public.dishes upsert row. Unlike populate-retail-dishes' buildRetailUpsertRow, hallTid
 * here is a REAL hall tid (1-4) and is written through unchanged -- reusing last_seen_hall_tid for
 * its existing "which hall this row belongs to" meaning (see this file's own header comment and
 * docs/briefs/foodpro-menu-expansion.md task 1), not a synthetic negated id. */
export function buildAlwaysAvailableUpsertRow(dishName: string, nutrition: AlwaysAvailableDishNutrition, allergens: string[], hallTid: number, updatedAt: string) {
  return {
    dish_name: dishName,
    nutrition,
    allergens,
    diet_tags: [] as string[],
    last_seen_hall_tid: hallTid,
    updated_at: updatedAt,
  };
}

Deno.serve(async (req) => {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  // location.aspx primes the session cookie longmenu.aspx needs (a cold direct fetch 500s, same as
  // populate-retail-dishes) -- a failure here means every hall crawl below would fail too, so this
  // is a real error response, not a swallowed-to-200.
  let setCookieValues: string[];
  try {
    const res = await fetch(`${BASE}location.aspx`);
    if (!res.ok) return json(502, { error: `location.aspx returned ${res.status}` });
    setCookieValues = res.headers.getSetCookie?.() ?? [];
  } catch (err) {
    return json(502, { error: `location.aspx fetch failed: ${err}` });
  }
  const cookieHeader = cookieHeaderFromSetCookie(setCookieValues);

  const updatedAt = new Date().toISOString();
  const rows: ReturnType<typeof buildAlwaysAvailableUpsertRow>[] = [];
  const missingDishNames: string[] = [];

  for (const hall of HALLS) {
    const curatedNames = new Set(ALWAYS_AVAILABLE_STATIONS.filter((s) => s.hallTid === hall.hallTid).flatMap((s) => s.dishNames));
    if (curatedNames.size === 0) continue; // no always-available station curated for this hall

    // Discover this hall's dishes across every meal period (a station like Pizza can be absent from
    // one meal's listing even though it's physically always there) through the same bounded pool as
    // populate-retail-dishes -- even 4 sequential fetches measured platform Gateway Timeouts for a
    // fully-sequential shape elsewhere in this codebase (see runPool's own doc comment).
    const discovered: DiscoveredDish[] = [];
    await runPool(MEAL_PERIODS, CRAWL_CONCURRENCY, async (meal) => {
      const url = `${BASE}longmenu.aspx?sName=%60&locationNum=${hall.locationNumRaw}&locationName=${hall.hrefLocationName}&naFlag=1&mealName=${encodeURIComponent(meal)}`;
      try {
        const res = await fetch(url, { headers: { Cookie: cookieHeader } });
        if (res.ok) discovered.push(...parseLongMenuDishes(await res.text()));
      } catch (err) {
        console.error(`populate-always-available-dishes: longmenu.aspx failed for hall ${hall.locationNumRaw} ${meal}:`, err);
      }
      await sleep(REQUEST_DELAY_MS);
    });

    const matched = matchCuratedDishes(discovered, curatedNames);
    for (const curatedName of curatedNames) {
      if (!matched.has(curatedName)) missingDishNames.push(`${curatedName} (hall ${hall.hallTid})`);
    }

    const entries = [...matched.entries()];
    await runPool(entries, CRAWL_CONCURRENCY, async ([dishName, labelPath]) => {
      try {
        const res = await fetch(`${BASE}${labelPath}`, { headers: { Cookie: cookieHeader } });
        if (res.ok) {
          const html = await res.text();
          const nutrition = parseLabelNutrition(html);
          if (nutrition) rows.push(buildAlwaysAvailableUpsertRow(dishName, nutrition, parseLabelAllergens(html), hall.hallTid, updatedAt));
        }
      } catch (err) {
        console.error(`populate-always-available-dishes: label.aspx failed for "${dishName}":`, err);
      }
      await sleep(REQUEST_DELAY_MS);
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("dishes").upsert(rows, { onConflict: "dish_name" });
    if (error) return json(500, { error: error.message });
  }

  // A curated dish not found this run isn't a hard failure (a station can legitimately run out or
  // be temporarily off the online menu) -- logged so a persistently-missing name signals the curated
  // list needs re-curating (see shared/src/alwaysAvailableStations.ts's own header), but the run
  // still succeeds for everything it did find.
  if (missingDishNames.length > 0) {
    console.error(`populate-always-available-dishes: curated dishes not found this run: ${missingDishNames.join(", ")}`);
  }

  return json(200, { rowsUpserted: rows.length, missingDishNames });
});
