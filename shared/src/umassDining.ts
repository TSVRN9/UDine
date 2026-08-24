import type { DiningHall, MealPeriod, MenuItem, NutritionFacts } from "./types.ts";

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

// The feed's raw JSON keys don't all match MealPeriod strings verbatim -- "late night" (a literal
// space) is the wire key for MealPeriod "latenight" (confirmed live 2026-08-21, tid=1 08/21/2026:
// {"lunch":...,"dinner":...,"late night":...}). Map wire key -> canonical MealPeriod instead of
// indexing the response object directly by MealPeriod name, which silently dropped this period.
const RAW_MEAL_PERIOD_KEYS: [string, MealPeriod][] = [
  ["breakfast", "breakfast"],
  ["lunch", "lunch"],
  ["dinner", "dinner"],
  ["late night", "latenight"],
];

// Canonical meal-period order for UI display, derived from the same mapping fetchMenu uses above
// instead of a second hardcoded list -- a client hardcoding its own ["breakfast","lunch","dinner"]
// is exactly how #137 silently dropped "latenight" from web's hall page after #133 added it here.
export const MEAL_PERIODS: MealPeriod[] = RAW_MEAL_PERIOD_KEYS.map(([, period]) => period);

/** Display label for a meal period -- "latenight" has no natural word break, everything else is
 * already a real word. */
export function mealPeriodLabel(period: MealPeriod): string {
  if (period === "latenight") return "Late Night";
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
    items.push({
      dishName,
      category,
      mealPeriod,
      hallTid,
      date: isoDate,
      nutrition,
      allergens: csvList(getAttr(attrs, "data-allergens")),
      dietTags: csvList(getAttr(attrs, "data-clean-diet-str")),
    });
  }
  return items;
}

/** Fetches one dining hall's full day of menu items across all meal periods it serves. */
export async function fetchMenu(hallTid: number, date: Date): Promise<MenuItem[]> {
  const url = `https://www.umassdining.com/foodpro-menu-ajax?tid=${hallTid}&date=${encodeURIComponent(formatDateParam(date))}`;
  const res = await fetch(url);
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
