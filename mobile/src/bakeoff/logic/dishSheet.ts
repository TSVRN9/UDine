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
  /** a where-served button: the sheet is already going away */
  onServe?: (t: ServeTarget) => void;
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
export const fc = (x: number) => Math.round(x).toLocaleString("en-US");
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
