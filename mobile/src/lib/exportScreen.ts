import type { Favorite, LogEntry } from "@udine/shared";
import { countLabel } from "./dataMap";

/**
 * Pure selection/count/plan logic for the Export screen (#183, artboard "Export data (final -
 * batch select)"). Kept out of the screen component so it's testable without rendering -- same
 * split as dataMap.ts/privacySettings.ts.
 */
export type StoreKey = "log" | "dishRankings" | "foodRankings" | "favorites";
export type FormatChoice = "csv" | "json" | "both";

/** Checklist row order, per the artboard. Also the order jobs run in regardless of selection order. */
export const STORE_ORDER: StoreKey[] = ["log", "dishRankings", "foodRankings", "favorites"];

export const STORE_TITLE: Record<StoreKey, string> = {
  log: "Food log",
  dishRankings: "Dish rankings",
  foodRankings: "Off-menu food rankings",
  favorites: "Favorites",
};

/** Short names for the bottom bar's "N selected" line, per the artboard's own example
 * (`log · dish rankings · favorites`). */
export const STORE_SHORT_NAME: Record<StoreKey, string> = {
  log: "log",
  dishRankings: "dish rankings",
  foodRankings: "food rankings",
  favorites: "favorites",
};

export function logSubline(entries: LogEntry[]): string {
  if (entries.length === 0) return countLabel(0, "entries");
  const earliest = entries.reduce((min, e) => (e.loggedAt < min ? e.loggedAt : min), entries[0].loggedAt);
  const since = new Date(earliest).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${countLabel(entries.length, "entries")} · since ${since}`;
}

/** `36 ranked · 118 comparisons`, per the artboard's Dish rankings row -- comparisons is the sum
 * of each ranked item's own comparisonCount, not a separate counter. */
export function rankedSubline(items: { comparisonCount: number }[]): string {
  const totalComparisons = items.reduce((sum, i) => sum + i.comparisonCount, 0);
  return `${countLabel(items.length, "ranked")} · ${countLabel(totalComparisons, "comparisons")}`;
}

export function favoritesSubline(favorites: Favorite[]): string {
  return countLabel(favorites.length, "favorites");
}

export function selectedStoreLabel(selected: StoreKey[]): string {
  return STORE_ORDER.filter((s) => selected.includes(s))
    .map((s) => STORE_SHORT_NAME[s])
    .join(" · ");
}

export interface ExportJob {
  store: StoreKey;
  format: "json" | "csv";
}

/** Ordered list of (store, format) jobs to run sequentially for a given selection + format
 * choice. BOTH expands to two jobs per selected store (json then csv) -- see the PR body for why
 * this is sequential shares rather than a zip: `expo-sharing`'s `shareAsync` takes exactly one
 * file per call and no zip library is installed, so sequential share-sheet calls is the smaller
 * honest implementation over adding a dependency. */
export function buildExportPlan(selected: StoreKey[], format: FormatChoice): ExportJob[] {
  const formats: ("json" | "csv")[] = format === "both" ? ["json", "csv"] : [format];
  const plan: ExportJob[] = [];
  for (const store of STORE_ORDER) {
    if (!selected.includes(store)) continue;
    for (const f of formats) plan.push({ store, format: f });
  }
  return plan;
}
