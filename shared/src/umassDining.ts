import type { DiningHall, HallMealPeriod, MealPeriod, MenuItem, NutritionFacts } from "./types.ts";

// Drupal taxonomy term ids.
export const DINING_HALLS: DiningHall[] = [
  { tid: 1, slug: "worcester", name: "Worcester" },
  { tid: 2, slug: "franklin", name: "Franklin" },
  { tid: 3, slug: "hampshire", name: "Hampshire" },
  { tid: 4, slug: "berkshire", name: "Berkshire" },
];

/**
 * Each hall's Grab 'N Go station has its OWN taxonomy term id, distinct from both the hall's own
 * tid above and the shared "Grab 'N Go" nav term (53, just a listing page linking out to these
 * four, not a menu feed). `foodpro-menu-ajax?tid=<this>&date=...` returns the identical response
 * shape as the halls (see parseCategoryItems/fetchMenu below) -- no separate client needed.
 */
export const GRAB_N_GO_TIDS: Record<string, number> = {
  worcester: 10667,
  franklin: 10716,
  hampshire: 10715,
  berkshire: 10666,
};

/**
 * Shared lookup behind hallNameFor/hallNameForOrNull below -- looks a tid up in DINING_HALLS
 * directly, then falls back to GRAB_N_GO_TIDS. Deliberately NOT collapsed to the bare hall name --
 * a dish logged from the hall and from its Grab 'N Go station are different Dish rows (different
 * hallTid) that can appear side by side in a pairwise comparison UI, so they need distinguishable
 * labels. Returns null if neither table has it.
 */
function resolveHallName(hallTid: number): string | null {
  const direct = DINING_HALLS.find((h) => h.tid === hallTid);
  if (direct) return direct.name;
  const gngSlug = Object.entries(GRAB_N_GO_TIDS).find(([, tid]) => tid === hallTid)?.[0];
  const gngHall = gngSlug ? DINING_HALLS.find((h) => h.slug === gngSlug) : undefined;
  return gngHall ? `${gngHall.name} Grab 'N Go` : null;
}

/**
 * Canonical hallTid -> display name lookup. For call sites that always render a hall label: an
 * unresolvable tid falls back to `Hall <tid>` rather than throwing or going blank, so a stale/
 * future tid degrades gracefully instead of breaking the screen.
 */
export function hallNameFor(hallTid: number): string {
  return resolveHallName(hallTid) ?? `Hall ${hallTid}`;
}

/**
 * Same resolution as hallNameFor, but for presentational call sites that want to omit the hall
 * label entirely when it's unknown rather than show a fallback string. Null in (no hall) or an
 * unresolvable tid both come back null -- never `Hall <tid>`. A Grab 'N Go station tid resolves to
 * "<Hall> Grab 'N Go" here (see resolveHallName above), not null -- building-granularity per
 * CLAUDE.md's data residency table.
 */
export function hallNameForOrNull(hallTid: number | null): string | null {
  return hallTid === null ? null : resolveHallName(hallTid);
}

// The feed's raw JSON keys don't all match MealPeriod strings verbatim -- "late night" (a literal
// space) is the wire key for MealPeriod "latenight". Map wire key -> canonical MealPeriod instead
// of indexing the response object directly by MealPeriod name, which silently drops this period.
const HALL_MEAL_PERIOD_KEYS: [string, HallMealPeriod][] = [
  ["breakfast", "breakfast"],
  ["lunch", "lunch"],
  ["dinner", "dinner"],
  ["late night", "latenight"],
];

// Retail-only wire keys -- some retail locations return a whole populated menu under the single
// key "daily offerings" (no breakfast/lunch/dinner split), and some also carry a "grabngo" key.
// Kept out of HALL_MEAL_PERIOD_KEYS/MEAL_PERIODS on purpose -- these are not one of the 4 hall-tab
// periods, and hall UIs iterate MEAL_PERIODS for their always-4 tabs. They exist here only so
// fetchMenu doesn't drop retail items on the floor; a retail-menu consumer reads
// MenuItem.mealPeriod directly rather than going through MEAL_PERIODS.
const RETAIL_ONLY_MEAL_PERIOD_KEYS: [string, MealPeriod][] = [
  ["daily offerings", "allday"],
  ["grabngo", "grabngo"],
];

const RAW_MEAL_PERIOD_KEYS: [string, MealPeriod][] = [...HALL_MEAL_PERIOD_KEYS, ...RETAIL_ONLY_MEAL_PERIOD_KEYS];

// Canonical meal-period order for UI display, derived from the same hall-only mapping fetchMenu
// uses above instead of a second hardcoded list. Deliberately NOT RAW_MEAL_PERIOD_KEYS.map(...) --
// that would leak "allday"/"grabngo" into every hall tab row. Typed HallMealPeriod[], not
// MealPeriod[] -- lets hall-only code index DiningHallHours by a period drawn from this array
// without tsc widening it to MealPeriod's retail-inclusive union.
export const MEAL_PERIODS: HallMealPeriod[] = HALL_MEAL_PERIOD_KEYS.map(([, period]) => period);

/** Display label for a meal period -- "latenight"/"allday"/"grabngo" have no natural word break,
 * everything else is already a real word. "allday"/"grabngo" are retail-only and never reach a hall
 * tab (MEAL_PERIODS excludes them), but a retail-menu consumer can call this directly on
 * MenuItem.mealPeriod, where title-casing would otherwise render "Allday"/"Grabngo". */
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
 * are indistinguishable through getAttr's "" default for both, so this reads the attribute
 * directly: undefined = attribute absent, null = present but blank.
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
 * Retail-only. Unlike every other per-dish field, the price span sits AFTER the dish's own
 * `<a>...</a>` tag closes, with 0+ legend `<img>` icons in between -- so it can't be captured
 * inside the same `<a ...>` regex match parseCategoryItems uses for everything else. Scopes the
 * search to the slice between this item's `</a>` and the next item's `<a data-dish-name=...>` (or
 * end of string) so a price span doesn't get attributed to the wrong dish.
 */
function priceAfter(html: string, fromIndex: number): string | undefined {
  const nextItemIndex = html.indexOf('data-dish-name="', fromIndex);
  const windowEnd = nextItemIndex === -1 ? html.length : nextItemIndex;
  const match = html.slice(fromIndex, windowEnd).match(/<span class="meal-price">([^<]*)<\/span>/);
  // `|| undefined`, not just `.trim()` -- an empty or blank price span means "no price here", same
  // absent-price contract as no span at all, not a `price: ""` that renders as a blank line.
  return match ? match[1].trim() || undefined : undefined;
}

/**
 * The menu-ajax response embeds each dish as an <a data-*="..."> tag rather than structured JSON.
 * No DOM is available on React Native/Hermes, so this parses the fragment with regex instead of
 * DOMParser.
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
      // Every -dv attribute is hyphenated except cholesterol, which the feed spells with an
      // underscore (data-cholesterol_dv). Not a typo to "fix".
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
    // getAttrRaw (not getAttr) so a present-but-empty attribute also collapses to undefined here --
    // an empty ingredients section is worse than none.
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

// foodpro-menu-ajax is deliberately uncacheable server-side (`cache-control: must-revalidate,
// no-cache, private`, no ETag/Last-Modified) -- politeness toward it has to be client-side, so
// fetchMenu below owns an in-memory cache instead of relying on conditional requests. Menu content
// for a date changes at most a few times a day, so ~30 min is plenty fresh.
const CACHE_TTL_MS = 30 * 60 * 1000;

interface MenuCacheEntry {
  items: MenuItem[];
  expiresAt: number;
}

// Module-level, process-wide -- fine since the data is public and unkeyed by user. Keyed
// `tid|MM/DD/YYYY`, matching the upstream URL's own identity.
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
 * `fetchImpl`/`now` are an injectable-seam pair for tests only -- every real caller omits them and
 * gets the global `fetch`/`Date.now`.
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
      // Clear the pending slot on failure so the next call retries fresh instead of replaying this
      // rejection.
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
