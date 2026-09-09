import type { NutritionFacts } from "@udine/shared";

export function formatGrams(g: number): string {
  return `${Math.round(g * 10) / 10}g`;
}

export function formatMg(mg: number): string {
  return `${Math.round(mg)}mg`;
}

/**
 * `null` (present-but-blank source attribute, e.g. a dish with no saturated fat DV to report) and
 * `undefined` (source has no %DV concept at all, e.g. an OpenFoodFacts item) both render as an em
 * dash — the label has no way to tell the two apart visually, nor does it need to. `0` is a real DV
 * and renders as "0%", not a dash.
 */
export function formatDv(pct: number | null | undefined): string {
  return pct == null ? "—" : `${Math.round(pct)}%`;
}

export interface LabelRow {
  label: string;
  amount: string;
  /** null = this nutrient has no %DV column on a real FDA label (trans fat, total sugars) — render
   * no cell, not a dash. A dash string means the column exists but this item has no value for it. */
  dv: string | null;
  indent?: boolean;
}

/** FDA-label row order and grouping (see the "Nutrition label" canvas artboard) for a NutritionFacts
 * snapshot — one row per line on the label, sub-nutrients indented under their parent. */
export function buildLabelRows(n: NutritionFacts): LabelRow[] {
  return [
    { label: "Total Fat", amount: formatGrams(n.totalFatG), dv: formatDv(n.totalFatDv) },
    { label: "Saturated Fat", amount: formatGrams(n.satFatG), dv: formatDv(n.satFatDv), indent: true },
    { label: "Trans Fat", amount: formatGrams(n.transFatG), dv: null, indent: true },
    { label: "Cholesterol", amount: formatMg(n.cholesterolMg), dv: formatDv(n.cholesterolDv) },
    { label: "Sodium", amount: formatMg(n.sodiumMg), dv: formatDv(n.sodiumDv) },
    { label: "Total Carbohydrate", amount: formatGrams(n.totalCarbG), dv: formatDv(n.totalCarbDv) },
    { label: "Dietary Fiber", amount: formatGrams(n.dietaryFiberG), dv: formatDv(n.dietaryFiberDv), indent: true },
    { label: "Total Sugars", amount: formatGrams(n.sugarsG), dv: null, indent: true },
    // Protein's %DV cell is blank on the FDA label (docs/design/NutritionLabel.dc.html:69-72) --
    // no dash, unlike a present-but-blank source attribute -- so this uses the same `dv: null`
    // "no column" path as Trans Fat / Total Sugars, not formatDv.
    { label: "Protein", amount: formatGrams(n.proteinG), dv: null },
  ];
}
