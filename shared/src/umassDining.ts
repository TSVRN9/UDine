import type { DiningHall, HallMealPeriod, MealPeriod, MenuItem, NutritionFacts } from "./types.ts";

// Drupal taxonomy term ids — confirmed via live network capture, see docs/apk-reverse-engineering.md.
export const DINING_HALLS: DiningHall[] = [
  { tid: 1, slug: "worcester", name: "Worcester" },
  { tid: 2, slug: "franklin", name: "Franklin" },
  { tid: 3, slug: "hampshire", name: "Hampshire" },
  { tid: 4, slug: "berkshire", name: "Berkshire" },
];

/**
 * Each hall's Grab 'N Go station has its OWN taxonomy term id, distinct from both the hall's own
 * tid above and the shared "Grab 'N Go" nav term (53 -- that one is just a listing page linking out
 * to these four, not a menu feed). Discovered live 2026-08-20 for issue #115: each location's own
 * page (e.g. https://www.umassdining.com/menu/hampshire-grab-n-go) embeds
 * `"umass_dining":{"tid":"10715"}` in its `drupal-settings-json` script tag; cross-checked against
 * GET /uapp/get_infov2, where the matching "<Hall> Grab 'N Go" location's `location_id` is the same
 * number. `foodpro-menu-ajax?tid=<this>&date=...` returns the identical response shape as the halls
 * (see parseCategoryItems/fetchMenu below, and grabNGo.test.ts) -- no separate client needed.
 */
export const GRAB_N_GO_TIDS: Record<string, number> = {
  worcester: 10667,
  franklin: 10716,
  hampshire: 10715,
  berkshire: 10666,
};

/**
 * Shared lookup behind hallNameFor/hallNameForOrNull below (#108) -- looks a tid up in
 * DINING_HALLS directly, then falls back to GRAB_N_GO_TIDS: a Grab 'N Go station's own tid is
 * distinct from its parent hall's (see the doc comment above). Deliberately NOT collapsed to the
 * bare hall name -- a dish logged from the hall and from its Grab 'N Go station are different Dish
 * rows (different hallTid) that can appear side by side in rank.tsx's pairwise comparison UI (and
 * web's /rank), so they need distinguishable labels, not the same one. Returns null if neither
 * table has it.
 */
function resolveHallName(hallTid: number): string | null {
  const direct = DINING_HALLS.find((h) => h.tid === hallTid);
  if (direct) return direct.name;
  const gngSlug = Object.entries(GRAB_N_GO_TIDS).find(([, tid]) => tid === hallTid)?.[0];
  const gngHall = gngSlug ? DINING_HALLS.find((h) => h.slug === gngSlug) : undefined;
  return gngHall ? `${gngHall.name} Grab 'N Go` : null;
}

/**
 * Canonical hallTid -> display name lookup (#108, collapsing 4+ hand-copied versions across
 * mobile/web that disagreed on fallback text -- `?? null`, `?? \`Hall ${tid}\``, `?? "somewhere"`).
 * For call sites that always render a hall label: an unresolvable tid falls back to `Hall <tid>`
 * rather than throwing or going blank, so a stale/future tid degrades gracefully instead of
 * breaking the screen. Every other divergent copy's fallback collapsed onto this one -- the
 * unreachable-in-practice ones (ping/sighting hall tids always come from a real DINING_HALLS
 * entry, never an unresolved one) lose their bespoke text ("somewhere") in favor of one consistent
 * fallback instead of three conventions for the same "not found" case.
 */
export function hallNameFor(hallTid: number): string {
  return resolveHallName(hallTid) ?? `Hall ${hallTid}`;
}

/**
 * Same resolution as hallNameFor, but for presentational call sites that want to omit the hall
 * label entirely when it's unknown rather than show a fallback string (e.g. youPaneFormat.ts's
 * TopFoodDisplay.hallName, conditionally rendered only when non-null). Null in (no hall) or an
 * unresolvable tid both come back null -- never `Hall <tid>`.
 *
 * NOT a like-for-like match with youPaneFormat.ts's own pre-#108 inline copy in one case: that
 * copy consulted DINING_HALLS only, so a Grab 'N Go station tid resolved to null (same as an
 * unresolvable tid). This resolves a gng tid to "<Hall> Grab 'N Go" instead (see resolveHallName
 * above) -- a real, disclosed behavior change on TopFoodDisplay.hallName, which privacySettings.ts
 * carries verbatim into the opt-in, friend-visible shared_stats.top_foods payload (see that file's
 * own comment). Still building-granularity per CLAUDE.md's data residency table, so sanctioned --
 * but it's new information a friend can see that couldn't be seen before this change, not merely a
 * refactor. Pinned in privacySettings.test.ts, not just here, because that's the actual seam this
 * value crosses.
 */
export function hallNameForOrNull(hallTid: number | null): string | null {
  return hallTid === null ? null : resolveHallName(hallTid);
}

// The feed's raw JSON keys don't all match MealPeriod strings verbatim -- "late night" (a literal
// space) is the wire key for MealPeriod "latenight" (confirmed live 2026-08-21, tid=1 08/21/2026:
// {"lunch":...,"dinner":...,"late night":...}). Map wire key -> canonical MealPeriod instead of
// indexing the response object directly by MealPeriod name, which silently dropped this period.
const HALL_MEAL_PERIOD_KEYS: [string, HallMealPeriod][] = [
  ["breakfast", "breakfast"],
  ["lunch", "lunch"],
  ["dinner", "dinner"],
  ["late night", "latenight"],
];

// #175: retail-only wire keys, confirmed live 2026-08-24 -- People's Organic Coffee (tid=32) returns
// a whole populated menu under the single key "daily offerings" (no breakfast/lunch/dinner split at
// all), and both People's Organic and Harvest Market (tid=4306) also carry a "grabngo" key. Kept out
// of HALL_MEAL_PERIOD_KEYS/MEAL_PERIODS on purpose -- these are NOT one of the 4 hall-tab periods
// (#144/#160/#163 pin MealPeriod's hall-tab consolidation to breakfast/lunch/dinner/latenight, and
// hall UIs iterate MEAL_PERIODS for their always-4 tabs). They exist here only so fetchMenu doesn't
// drop retail items on the floor; a retail-menu consumer (not yet built) reads MenuItem.mealPeriod
// directly rather than going through MEAL_PERIODS.
//
// Checked for live damage to GRAB_N_GO_TIDS (each hall's own Grab 'N Go station, a different concept
// from retail's "grabngo" key): live-fetched tid=10667/10715 for 09/02/2026 came back
// ["breakfast","lunch"] / ["breakfast"] -- ordinary hall-style keys, never "grabngo". No existing
// grab-n-go screens were dropping periods.
const RETAIL_ONLY_MEAL_PERIOD_KEYS: [string, MealPeriod][] = [
  ["daily offerings", "allday"],
  ["grabngo", "grabngo"],
];

const RAW_MEAL_PERIOD_KEYS: [string, MealPeriod][] = [...HALL_MEAL_PERIOD_KEYS, ...RETAIL_ONLY_MEAL_PERIOD_KEYS];

// Canonical meal-period order for UI display, derived from the same hall-only mapping fetchMenu uses
// above instead of a second hardcoded list -- a client hardcoding its own ["breakfast","lunch","dinner"]
// is exactly how #137 silently dropped "latenight" from web's hall page after #133 added it here.
// Deliberately NOT RAW_MEAL_PERIOD_KEYS.map(...) -- that would leak "allday"/"grabngo" into every hall
// tab row (see RETAIL_ONLY_MEAL_PERIOD_KEYS's doc comment above). Typed HallMealPeriod[], not
// MealPeriod[] -- lets hall-only code (mealTabSubtitle, deriveHomeHero) index DiningHallHours by a
// period drawn from this array without tsc widening it to MealPeriod's retail-inclusive union.
export const MEAL_PERIODS: HallMealPeriod[] = HALL_MEAL_PERIOD_KEYS.map(([, period]) => period);

/** Display label for a meal period -- "latenight"/"allday"/"grabngo" have no natural word break,
 * everything else is already a real word. "allday"/"grabngo" (#175) are retail-only and never reach
 * a hall tab (MEAL_PERIODS excludes them), but a future retail-menu consumer (the café-tap feature
 * this and #175 are prerequisite plumbing for -- see #177/#178) calls this directly on
 * MenuItem.mealPeriod, not through MEAL_PERIODS, so a real label matters here too -- title-casing
 * would otherwise render "Allday"/"Grabngo". */
export function mealPeriodLabel(period: MealPeriod): string {
  if (period === "latenight") return "Late Night";
  if (period === "allday") return "All Day";
  if (period === "grabngo") return "Grab 'N Go";
  return period.charAt(0).toUpperCase() + period.slice(1);
}

function formatDateParam(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${date.getFullYear()}`;
}

function toIsoDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&#039;": "'",
  "&quot;": '"',
  "&lt;": "<",
  "&gt;": ">",
};

function decodeEntities(s: string): string {
  return s.replace(/&(amp|#039|quot|lt|gt);/g, (m) => ENTITIES[m] ?? m);
}

/** undefined when the attribute isn't in the tag at all; "" when it's present but empty (e.g.
 * data-sat-fat-dv=""). getAttr collapses that distinction on purpose (every non-DV caller wants a
 * plain default-"" string) — dv() below needs the distinction back, so it goes around getAttr. */
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

/**
 * %DV attributes come through three ways: a real number, present-but-blank (the dish/nutrient has
 * no established FDA daily value, e.g. trans fat), or entirely absent from the tag. The first two
 * are indistinguishable if this goes through getAttr's "" default for both -- so it reads the
 * attribute directly, and implements the undefined/null contract shared/src/types.ts documents on
 * NutritionFacts's *Dv fields: undefined = attribute absent, null = present but blank.
 */
function dv(attrs: string, name: string): number | null | undefined {
  const raw = getAttrRaw(attrs, name);
  if (raw === undefined) return undefined;
  return raw === "" ? null : num(raw);
}

function csvList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * #176: retail-only. Unlike every other per-dish field, the price span sits AFTER the dish's own
 * `<a>...</a>` tag closes, with 0+ legend `<img>` icons in between (real capture: Green Fields
 * `.../a><img.../><img.../><span class="meal-price">$2.50</span></li>`) -- so it can't be captured
 * inside the same `<a ...>` regex match parseCategoryItems uses for everything else. Scopes the
 * search to the slice between this item's `</a>` and the next item's `<a data-dish-name=...>` (or
 * end of string) so a price span doesn't get attributed to the wrong dish. Halls have no such span
 * -- undefined there, never a stray value borrowed from a neighboring tag.
 */
function priceAfter(html: string, fromIndex: number): string | undefined {
  const nextItemIndex = html.indexOf('data-dish-name="', fromIndex);
  const windowEnd = nextItemIndex === -1 ? html.length : nextItemIndex;
  const match = html.slice(fromIndex, windowEnd).match(/<span class="meal-price">([^<]*)<\/span>/);
  // `|| undefined`, not just `.trim()` -- a real capture (Harvest Market, tid=4306) has a legend-icon
  // block with no price span at all between two priced dishes; an empty match[1] (or a span present
  // but blank, `<span class="meal-price"></span>`) means "no price here", same absent-price contract
  // as a hall item with no span at all, not a `price: ""` that renders as a blank line.
  return match ? match[1].trim() || undefined : undefined;
}

/**
 * The menu-ajax response embeds each dish as an <a data-*="..."> tag rather than
 * structured JSON (see docs/apk-reverse-engineering.md). No DOM is available on
 * React Native/Hermes, so this parses the fragment with regex instead of DOMParser
 * — deliberately, not just for lack of a better tool.
 */
export function parseCategoryItems(html: string, category: string, mealPeriod: MealPeriod, hallTid: number, isoDate: string): MenuItem[] {
  const items: MenuItem[] = [];
  const tagPattern = /<a\s+([^>]*data-dish-name="[^"]*"[^>]*)>([^<]*)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = tagPattern.exec(html)) !== null) {
    const attrs = m[1];
    const dishName = getAttr(attrs, "data-dish-name") || decodeEntities(m[2]).trim();
    const nutrition: NutritionFacts = {
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
      // #91: real captured fragments (see umassDining.test.ts) — every -dv attribute is hyphenated
      // except cholesterol, which the feed spells with an underscore (data-cholesterol_dv). Not a typo
      // to "fix": getAttr must match the real attribute name or this field silently comes back blank.
      totalFatDv: dv(attrs, "data-total-fat-dv"),
      satFatDv: dv(attrs, "data-sat-fat-dv"),
      cholesterolDv: dv(attrs, "data-cholesterol_dv"),
      sodiumDv: dv(attrs, "data-sodium-dv"),
      totalCarbDv: dv(attrs, "data-total-carb-dv"),
      dietaryFiberDv: dv(attrs, "data-dietary-fiber-dv"),
      sugarsDv: dv(attrs, "data-sugars-dv"),
      proteinDv: dv(attrs, "data-protein-dv"),
    };
    const price = priceAfter(html, tagPattern.lastIndex);
    // getAttrRaw (not getAttr) so a present-but-empty attribute also collapses to undefined here,
    // same "|| undefined" contract priceAfter already uses -- an empty ingredients section is worse
    // than none.
    const ingredients = getAttrRaw(attrs, "data-ingredient-list") || undefined;
    items.push({
      dishName,
      category,
      mealPeriod,
      hallTid,
      date: isoDate,
      nutrition,
      allergens: csvList(getAttr(attrs, "data-allergens")),
      dietTags: csvList(getAttr(attrs, "data-clean-diet-str")),
      ...(price !== undefined ? { price } : {}),
      ...(ingredients !== undefined ? { ingredients } : {}),
    });
  }
  return items;
}

// #169: foodpro-menu-ajax is confirmed live to be deliberately uncacheable server-side
// (`cache-control: must-revalidate, no-cache, private`, no ETag/Last-Modified, no CDN absorption)
// -- politeness toward it has to be client-side, so fetchMenu below owns an in-memory cache instead
// of relying on conditional requests (there are no validators to condition on -- don't add
// If-None-Match support, it would be dead code). Menu content for a date changes at most a few times
// a day, so ~30 min is plenty fresh.
const CACHE_TTL_MS = 30 * 60 * 1000;

interface MenuCacheEntry {
  items: MenuItem[];
  expiresAt: number;
}

// Module-level, process-wide (mirrors web's server-side proxy route: this is a shared cache across
// requests there, not per-user -- fine, since the data is public and unkeyed by user). Keyed
// `tid|MM/DD/YYYY` (the same string the upstream URL itself uses) since that's exactly the upstream
// request's identity.
// ponytail: unbounded -- an entry for a tid|date combo never requested again just sits here for the
// process's life (mobile is session-bounded so this barely matters there; web's long-lived server
// process is the one that could accumulate). Add expiry-sweep-on-read or an LRU cap if that process's
// memory ever actually shows it.
const menuCache = new Map<string, MenuCacheEntry>();
// Concurrent calls for the same key (e.g. rapid date-stepper taps) share one pending upstream
// request instead of firing one each.
const menuFetchesInFlight = new Map<string, Promise<MenuItem[]>>();

function menuCacheKey(hallTid: number, date: Date): string {
  return `${hallTid}|${formatDateParam(date)}`;
}

/**
 * Fetches one dining hall's full day of menu items across all meal periods it serves.
 *
 * `fetchImpl`/`now` are an injectable-seam pair for tests only (same trailing-default-param shape as
 * check-favorited-foods/index.ts's fetchHallMenu) -- every real caller omits them and gets the global
 * `fetch`/`Date.now`.
 */
export async function fetchMenu(hallTid: number, date: Date, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): Promise<MenuItem[]> {
  const key = menuCacheKey(hallTid, date);

  const cached = menuCache.get(key);
  // Callers must not mutate this array -- it's the cached instance itself, not a copy, and every
  // other caller of this key gets handed the same reference until it expires.
  if (cached && cached.expiresAt > now()) return cached.items;

  const inFlight = menuFetchesInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = fetchMenuUncached(hallTid, date, fetchImpl)
    .then((items) => {
      menuCache.set(key, { items, expiresAt: now() + CACHE_TTL_MS });
      menuFetchesInFlight.delete(key);
      return items;
    })
    .catch((err) => {
      // A failed fetch must not poison anything: clear the pending slot (nothing cached, nothing
      // left in flight) so the very next call retries fresh instead of replaying this rejection.
      menuFetchesInFlight.delete(key);
      throw err;
    });
  menuFetchesInFlight.set(key, promise);
  return promise;
}

async function fetchMenuUncached(hallTid: number, date: Date, fetchImpl: typeof fetch): Promise<MenuItem[]> {
  const url = `https://www.umassdining.com/foodpro-menu-ajax?tid=${hallTid}&date=${encodeURIComponent(formatDateParam(date))}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`foodpro-menu-ajax ${res.status}`);
  const data = (await res.json()) as Partial<Record<string, Record<string, string>>>;
  const isoDate = toIsoDate(date);
  const items: MenuItem[] = [];
  for (const [rawKey, mealPeriod] of RAW_MEAL_PERIOD_KEYS) {
    const categories = data[rawKey];
    if (!categories) continue;
    for (const [category, html] of Object.entries(categories)) {
      items.push(...parseCategoryItems(html, category, mealPeriod, hallTid, isoDate));
    }
  }
  return items;
}
