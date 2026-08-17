import type { DailyMacroTotals, LogEntry } from "./types.ts";

/** Sums logged entries for a single day into daily macro totals. Entries must already be filtered to that date. */
export function computeDailyTotals(date: string, entries: LogEntry[]): DailyMacroTotals {
  return entries.reduce(
    (totals, entry) => ({
      date,
      calories: totals.calories + entry.nutrition.calories * entry.servings,
      proteinG: totals.proteinG + entry.nutrition.proteinG * entry.servings,
      totalCarbG: totals.totalCarbG + entry.nutrition.totalCarbG * entry.servings,
      totalFatG: totals.totalFatG + entry.nutrition.totalFatG * entry.servings,
    }),
    { date, calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 },
  );
}

export function isoDateOf(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}
