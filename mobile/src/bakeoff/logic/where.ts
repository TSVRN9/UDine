import { effectiveMealWindow } from "@udine/shared";
import type { HallMealPeriod } from "@udine/shared";
import { MEAL_LABEL, dishKey, isCafe, placeOrder } from "./fixture";
import type { Fixture, MealKey, PlaceKey } from "./types";

export type WhereState = "now" | "later" | "tomorrow";
export interface WhereGroup { st: WhereState; meal: MealKey; day: 0 | 1; open: string; close: string; halls: PlaceKey[] }

const STANDARD: Partial<Record<MealKey, HallMealPeriod>> = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner", late: "latenight" };
const toMin = (t: string) => { const m = /^(\d+):(\d+)\s*(AM|PM)$/i.exec(t)!; return (+m[1] % 12 + (m[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + +m[2]; };
const fmtMin = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`;
const atMin = (d: Date, m: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(m / 60), m % 60);

/**
 * The window a place serves a meal, whatever the clock says (M2 also needs later today and tomorrow, and
 * effectiveMealWindow only answers while the place is open): probe it at the place's own opening time.
 */
export function mealWindow(fx: Fixture, place: PlaceKey, meal: MealKey, now: Date): [string, string] | null {
  const h = fx.hours[place];
  if (!isCafe(place) && meal === "grab") { const g = fx.grab[place as "W"]; return [g.openTime, g.closeTime]; }
  if (meal === "all" || meal === "grab") return h.general ? [h.general.openTime, h.general.closeTime] : null;
  if (!h.general) return null;
  const w = effectiveMealWindow(h, STANDARD[meal]!, atMin(now, toMin(h.general.openTime)));
  return w ? [w.openTime, w.closeTime] : null;
}

const nextIso = (iso: string) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Where can I get this? At most two groups: the soonest, plus one more today that names a place the first doesn't. */
export function whereAnswer(fx: Fixture, dish: string, now: Date, opts: { newton?: boolean } = {}): WhereGroup[] {
  const key = dishKey(dish), today = localIso(now), nowMin = now.getHours() * 60 + now.getMinutes();
  const newton = new Set(fx.places.filter((p) => p.area === 4).map((p) => p.key));
  const groups = new Map<string, WhereGroup & { w: [number, number] }>();
  [today, nextIso(today)].forEach((iso, day) => {
    for (const [place, meals] of Object.entries(fx.days[iso] ?? {}) as [PlaceKey, Partial<Record<MealKey, { dishes: { key: string }[] }[]>>][]) {
      if (newton.has(place) && !opts.newton) continue;
      for (const [meal, stations] of Object.entries(meals) as [MealKey, { dishes: { key: string }[] }[]][]) {
        if (!stations.some((s) => s.dishes.some((d) => d.key === key))) continue;
        const win = mealWindow(fx, place, meal, now);
        if (!win) continue;
        const w: [number, number] = [toMin(win[0]), toMin(win[1])];
        const st: WhereState | "past" = day ? "tomorrow" : nowMin >= w[1] ? "past" : nowMin >= w[0] ? "now" : "later";
        if (st === "past") continue;
        const gk = [st, meal, ...w].join();
        if (!groups.has(gk)) groups.set(gk, { st, meal, day: day as 0 | 1, open: fmtMin(w[0]), close: fmtMin(w[1]), halls: [], w });
        const g = groups.get(gk)!;
        if (!g.halls.includes(place)) g.halls.push(place);
      }
    }
  });
  const R = { now: 0, later: 1, tomorrow: 2 };
  const gs = [...groups.values()]
    .sort((a, b) => R[a.st] - R[b.st] || (a.st === "now" ? a.w[1] - b.w[1] : a.w[0] - b.w[0]) || placeOrder(a.halls[0]) - placeOrder(b.halls[0]))
    .map(({ w: _w, ...g }) => ({ ...g, halls: [...g.halls].sort((a, b) => placeOrder(a) - placeOrder(b)) }));
  if (!gs.length) return [];
  const [first] = gs;
  const more = gs.slice(1).filter((g) => !g.day).map((g) => ({ ...g, halls: g.halls.filter((h) => !first.halls.includes(h)) })).find((g) => g.halls.length);
  return more ? [first, more] : [first];
}

export const fmtT = (t: string) => {
  const m = toMin(t);
  if (m >= 1439) return "midnight";
  if (m === 720) return "noon";
  return `${((Math.floor(m / 60) + 11) % 12) + 1}${m % 60 ? ":" + String(m % 60).padStart(2, "0") : ""} ${m < 720 ? "AM" : "PM"}`;
};
const mealName = (m: MealKey) => (m === "grab" ? "Grab 'N Go" : MEAL_LABEL[m]);
const mealWord = (m: MealKey) => (m === "grab" ? "Grab 'N Go" : MEAL_LABEL[m].toLowerCase());

/** What the sheet prints for a group; a second line for the same meal at the same moment only gives its own time. */
export function whenText(g: WhereGroup, prev?: WhereGroup): string {
  const same = !!prev && prev.st === g.st && prev.meal === g.meal;
  if (g.meal === "all")
    return g.st === "now" ? (same ? `Until ${fmtT(g.close)}` : `Now, until ${fmtT(g.close)}`) : g.st === "later" ? `From ${fmtT(g.open)}` : `Tomorrow, from ${fmtT(g.open)}`;
  return g.st === "now" ? (same ? `Until ${fmtT(g.close)}` : `${mealName(g.meal)} now, until ${fmtT(g.close)}`)
    : g.st === "later" ? (same ? `From ${fmtT(g.open)}` : `${mealName(g.meal)} from ${fmtT(g.open)}`)
    : `Tomorrow, ${mealWord(g.meal)} from ${fmtT(g.open)}`;
}

