import { clockMeal, isCafe } from "./fixture";
import type { Carbon, Dish, Fixture, MealKey, PlaceKey, Station } from "./types";

/** Dietary preferences as You holds them. `avoid` holds allergen names as `Dish.allergens` spells them. */
export interface Prefs { veg: boolean; plant: boolean; halal: boolean; avoid: string[] }
export const NO_PREFS: Prefs = { veg: false, plant: false, halal: false, avoid: [] };
/** The feed's allergens in Dietary preferences' order (M2's ALG). */
export const ALLERGENS = ["Milk", "Eggs", "Fish", "Shellfish", "Tree Nuts", "Peanuts", "Wheat", "Soy", "Sesame", "Gluten", "Corn"];
/** M2's MEALS: the order a place's tabs run in. */
export const MEAL_ORDER: MealKey[] = ["breakfast", "lunch", "dinner", "late", "all", "grab"];

const dietOn = (p: Prefs) => p.veg || p.plant || p.halal;
const dietOK = (p: Prefs, d: Dish) => (!p.veg || !!(d.diet & 3)) && (!p.plant || !!(d.diet & 2)) && (!p.halal || !!(d.diet & 4));
/** The avoided allergens a dish lists. A blank list is "not listed", never "none": such a dish has no hits. */
export const hits = (p: Prefs, d: Dish): string[] => (p.avoid.length ? p.avoid.filter((a) => d.allergens.includes(a)) : []);
const lc = (a: string) => a.toLowerCase();
const orList = (l: string[]) => (l.length < 2 ? l.join("") : l.length <= 3 ? `${l.slice(0, -1).join(", ")} or ${l[l.length - 1]}` : `${l.slice(0, 3).join(", ")} or ${l.length - 3} more`);
const dietWords = (p: Prefs) => [p.plant && "plant based", p.veg && !p.plant && "vegetarian", p.halal && "halal"].filter(Boolean).join(", ");

export interface MenuView {
  sections: Station[];
  /** how many dishes an avoided allergen hides (diet-hidden dishes aren't counted: the line never calls the rest safe) */
  hidden: number;
  /** the one line over the list, or null when there is nothing to say */
  line: string | null;
}

/**
 * M2's renderMenuList: a place's meal on a day after diet and allergen filtering. `showAll` is the line's Show all:
 * every dish, no hidden count, and it is only an argument here, never written back to the preferences.
 */
export function menuView(fx: Fixture, day: string, place: PlaceKey, meal: MealKey, prefs: Prefs, showAll: boolean): MenuView {
  const stations = fx.days[day]?.[place]?.[meal] ?? [];
  const flat = stations.flatMap((s) => s.dishes);
  const byAllergen = flat.filter((d) => dietOK(prefs, d) && hits(prefs, d).length);
  const sections = stations
    .map((s) => ({ ...s, dishes: showAll ? s.dishes : s.dishes.filter((d) => dietOK(prefs, d) && !hits(prefs, d).length) }))
    .filter((s) => s.dishes.length);
  const hidden = showAll ? 0 : byAllergen.length;
  return { sections, hidden, line: line(prefs, byAllergen, showAll) };
}

function line(p: Prefs, byAllergen: Dish[], revealed: boolean): string | null {
  if (!dietOn(p) && !p.avoid.length) return null;
  if (!dietOn(p) && !byAllergen.length) return null;
  if (revealed) return "Showing all dishes";
  const al = ALLERGENS.filter((a) => byAllergen.some((d) => hits(p, d).includes(a))).map(lc);
  const n = byAllergen.length, dw = dietOn(p) ? `Showing ${dietWords(p)} dishes` : "";
  const aw = n ? `${dw ? ", hiding " + n : "Hiding " + n + (n === 1 ? " dish" : " dishes")} that list${n === 1 ? "s" : ""} ${orList(al)}` : "";
  return dw + aw;
}

/** What a row draws as scores, or null for nothing at all (no group, so no gap and no shift). Unscored kinds never draw. */
export function rowScores(d: Pick<Dish, "health" | "carbon">, on: { health: boolean; carbon: boolean }): { health: number | null; carbon: Carbon | null } | null {
  const health = on.health ? d.health : null, carbon = on.carbon ? d.carbon : null;
  return health == null && carbon == null ? null : { health, carbon };
}

export const mealsOf = (fx: Fixture, day: string, place: PlaceKey): MealKey[] => MEAL_ORDER.filter((m) => fx.days[day]?.[place]?.[m]);
/** Keep the meal if the day has it, else the clock's, else all day, else the first (M2 renderMenu). */
export function defaultMeal(fx: Fixture, day: string, place: PlaceKey, meal: MealKey): MealKey {
  const ms = mealsOf(fx, day, place);
  if (!ms.length || ms.includes(meal)) return meal;
  const cm = clockMeal(new Date(fx.clock));
  return ms.includes(cm) ? cm : ms.includes("all") ? "all" : ms[0];
}
/** A café that never has more than one menu a day has no tab row: its day cell leads the station row. */
export const isOneMeal = (fx: Fixture, place: PlaceKey): boolean =>
  isCafe(place) && Object.values(fx.days).every((d) => !d[place] || Object.keys(d[place]!).length <= 1);

export const dayIsos = (fx: Fixture): string[] => Object.keys(fx.days);
const fmtD = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", ...o });
/** The day cell: "Today", "Fri 9". */
export const dayCell = (fx: Fixture, i: number): string => (i === 0 ? "Today" : `${fmtD(dayIsos(fx)[i], { weekday: "short" })} ${new Date(dayIsos(fx)[i] + "T12:00:00Z").getUTCDate()}`);
/** "Saturday, October 10". */
export const dayFull = (fx: Fixture, i: number): string => fmtD(dayIsos(fx)[i], { weekday: "long", month: "long", day: "numeric" });
/** The schedule's rows: "Today", "Tomorrow", then the full date. */
export const dayLong = (fx: Fixture, i: number): string => (i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayFull(fx, i));

export type Item =
  | { t: "note"; line: string; revealed: boolean }
  | { t: "head"; name: string; si: number }
  | { t: "dish"; dish: Dish; contains: string[] }
  | { t: "empty"; text: string };

/** The one flat list a hall screen scrolls. A revealed row that lists an avoided allergen carries it as `contains`. */
export function menuItems(v: MenuView, prefs: Prefs, showAll: boolean, emptyText: string): Item[] {
  if (!v.sections.length && !v.line) return emptyText ? [{ t: "empty", text: emptyText }] : [];
  return [
    ...(v.line ? [{ t: "note", line: v.line, revealed: showAll } as Item] : []),
    ...v.sections.flatMap((s, si): Item[] => [
      { t: "head", name: s.name, si },
      ...s.dishes.map((dish): Item => ({ t: "dish", dish, contains: showAll ? hits(prefs, dish) : [] })),
    ]),
  ];
}
