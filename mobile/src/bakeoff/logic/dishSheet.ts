import { shownPrice } from "./fixture";
import type { Carbon, Dish, MealKey, Nutrition, PlaceKey } from "./types";

/** Where a dish sheet was opened from, and what it needs to answer "where is it served". `plate` is Task 7's entry. */
export interface DishCtx {
  from: "hall" | "plate";
  /** the place whose serving this is: price and macros come from it (a café serving carries a price, a hall's never does) */
  place: PlaceKey;
  meal: MealKey;
  /** index into the fixture's days; Add is only offered today (M2 `d.day`) */
  day: number;
  /** Add / Add another: Task 7's store. Unset until then. */
  onAdd?: () => void;
  /** a where-served button was tapped: prepare the destination now (the sheet is going away) */
  onServe?: (t: ServeTarget) => void;
  /** the sheet is half-way out: the destination may start to move */
  onServeGo?: () => void;
}
export interface ServeTarget { place: PlaceKey; meal: MealKey; day: 0 | 1; dish: string }

/** M2 `dishMid`: the sheet's resting height ends on the label's rule under Calories, then a 6 dp sliver (never half a line). */
export function restingSnap({ calBottom, grab, winH, top }: { calBottom: number; grab: number; winH: number; top: number }): number {
  return Math.min(grab + calBottom + 6, winH - top - 8);
}

export interface SheetMarks { marks: ("plant" | "veg" | "halal" | "local" | "sus")[]; health: number | null; carbon: Carbon | null }
/**
 * M2's `.mks` row: the dish's marks, then its score tiles per the You toggles. Null when there is nothing in it: no row, so no
 * empty slot and no gap. An unscored kind never draws (a healthfulness 0 is a real score).
 */
export function sheetMarks(d: Pick<Dish, "diet" | "health" | "carbon">, on: { health: boolean; carbon: boolean }): SheetMarks | null {
  const marks: SheetMarks["marks"] = [];
  if (d.diet & 2) marks.push("plant"); else if (d.diet & 1) marks.push("veg");
  if (d.diet & 4) marks.push("halal");
  if (d.diet & 8) marks.push("local");
  if (d.diet & 16) marks.push("sus");
  const health = on.health ? d.health : null, carbon = on.carbon ? d.carbon : null;
  return marks.length || health != null || carbon != null ? { marks, health, carbon } : null;
}

const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, "");
/** en-US thousands grouping without Intl (a JNI call per use on Hermes; a row has two). */
export const fc = (x: number) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** FDA daily values M2 computes %DV from when the menu publishes none. Cholesterol never has a published one. */
const FDA = { fat: 78, sat: 20, chol: 300, sod: 2300, carb: 275, fiber: 28, protein: 50 };

/** `left` is `name value` as M2 prints it; `name` is the bold part of a top-level row. */
export interface LabelRow { kind: "thin" | "row" | "sub"; left: string; name: string; value: string; right: string; last?: boolean }
export interface Label { serving: string | null; cal: string; rows: LabelRow[] }

/** M2 `labelHTML`: Nutrition Facts rows with %DV (the menu's own when published, else computed from FDA values). */
export function labelRows(n: Nutrition, cal: number, serving: string): Label {
  const g = (v: number | null, u = "g") => (v == null ? "–" : `${f1(v)}${u}`);
  const pc = (v: number | null, dv: number | null, base: number | null) => {
    const p = dv != null ? dv : v != null && base ? Math.round((v / base) * 100) : null;
    return p == null ? "" : `${p}%`;
  };
  const row = (kind: "row" | "sub", name: string, v: number | null, u: string, dv: number | null, base: number | null, last = false): LabelRow =>
    ({ kind, left: `${name} ${g(v, u)}`, name, value: g(v, u), right: pc(v, dv, base), ...(last ? { last } : null) });
  return {
    serving: serving || null,
    cal: fc(cal),
    rows: [
      ...(n.fatCal != null ? [{ kind: "thin" as const, left: "", name: "", value: "", right: `Fat cal. ${fc(n.fatCal)}` }] : []),
      { kind: "thin", left: "", name: "", value: "", right: "% Daily Value*" },
      row("row", "Total Fat", n.fat, "g", n.fatDv, FDA.fat),
      row("sub", "Saturated Fat", n.sat, "g", n.satDv, FDA.sat),
      row("sub", "Trans Fat", n.trans, "g", null, null),
      row("row", "Cholesterol", n.chol, "mg", null, FDA.chol),
      row("row", "Sodium", n.sod, "mg", n.sodDv, FDA.sod),
      row("row", "Total Carbohydrate", n.carb, "g", n.carbDv, FDA.carb),
      row("sub", "Dietary Fiber", n.fiber, "g", n.fiberDv, FDA.fiber),
      row("sub", "Total Sugars", n.sugar, "g", null, null),
      row("row", "Protein", n.protein, "g", n.proteinDv, FDA.protein, true),
    ],
  };
}

/** The price the sheet prints, "$13.50", for a café serving only. */
export const sheetPrice = (ctx: Pick<DishCtx, "place">, d: Dish): string | null => shownPrice(ctx.place, d);

/** UMass Dining's Climate-Conscious Dining bands (M2 `CRB`), per kg of food: never summed or averaged across a plate. */
export const CARBON_BAND: Record<Carbon, string> = {
  A: "Very low: under 1.75", B: "Low: 1.75 to 3", C: "Medium: 3 to 4.25", D: "High: 4.25 to 5.5", E: "Very high: over 5.5",
};

/**
 * The bottom of the label's Calories rule from the dish alone, before anything is drawn, so the sheet can start rising at once and
 * retarget to the measured value while it does. Widths are Oswald/Libre Franklin averages at M2's sizes read off the device; the
 * estimate is within a few dp for a typical dish, and a miss only means a small retarget during the rise.
 */
export function estimateCalBottom(d: Pick<Dish, "name" | "serving" | "allergens" | "diet">, o: {
  width: number; price: boolean; add: boolean; health: boolean; carbon: boolean; where: { chips: number[]; letters: boolean[] }[];
}): number {
  const rows = (widths: number[], gap: number, avail: number) => {
    let n = widths.length ? 1 : 0, x = 0;
    for (const w of widths) { if (x && x + gap + w > avail) { n++; x = w; } else x += (x ? gap : 0) + w; }
    return n;
  };
  const wrap = (text: string, per: number, avail: number) => {
    let n = 1, x = 0;
    for (const word of text.split(" ")) { const w = (word.length + 1) * per; if (x && x + w > avail + per) { n++; x = w; } else x += w; }
    return n;
  };
  const avail = o.width - 40;
  let y = 4 + 32 * wrap(d.name, 12.3, avail);
  if (o.price || d.serving) y += 4 + 20;
  const tiles = (o.health ? 1 : 0) + (o.carbon ? 1 : 0);
  const marks = sheetMarks({ ...d, health: o.health ? 0 : null, carbon: o.carbon ? "A" : null }, { health: true, carbon: true });
  if (marks) {
    const w = marks.marks.map((k) => 44 + 6.7 * ({ plant: 11, veg: 10, halal: 5, local: 5, sus: 11 }[k]));
    if (tiles) w.push(tiles * 24 + (tiles - 1) * 8);
    y += 8 + 30 * rows(w, 8, avail) + 8 * (rows(w, 8, avail) - 1);
  }
  if (d.allergens.length) y += 8 + 21 * wrap(`Contains ${d.allergens.join(", ")}`, 7.1, avail);
  if (o.add) y += 16 + 52;
  y += 24;
  o.where.forEach((g, i) => {
    y += (i ? 16 : 0) + 24 + 8;
    const r = rows(g.chips.map((c, k) => (g.letters[k] ? 62 : 32) + 8.1 * c), 8, avail);
    y += 44 * r + 8 * (r - 1);
  });
  if (!o.where.length) y += 24;
  // the label: margin, frame and padding, title, serving row, then the Calories row
  return y + 24 + 6 + 40 + (d.serving ? 40 : 0) + 54;
}
