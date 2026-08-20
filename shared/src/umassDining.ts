import type { DiningHall, MealPeriod, MenuItem, NutritionFacts } from "./types.ts";

// Drupal taxonomy term ids — confirmed via live network capture, see docs/apk-reverse-engineering.md.
export const DINING_HALLS: DiningHall[] = [
  { tid: 1, slug: "worcester", name: "Worcester" },
  { tid: 2, slug: "franklin", name: "Franklin" },
  { tid: 3, slug: "hampshire", name: "Hampshire" },
  { tid: 4, slug: "berkshire", name: "Berkshire" },
];

const MEAL_PERIODS: MealPeriod[] = ["breakfast", "lunch", "dinner"];

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
  const data = (await res.json()) as Partial<Record<MealPeriod, Record<string, string>>>;
  const isoDate = toIsoDate(date);
  const items: MenuItem[] = [];
  for (const mealPeriod of MEAL_PERIODS) {
    const categories = data[mealPeriod];
    if (!categories) continue;
    for (const [category, html] of Object.entries(categories)) {
      items.push(...parseCategoryItems(html, category, mealPeriod, hallTid, isoDate));
    }
  }
  return items;
}
