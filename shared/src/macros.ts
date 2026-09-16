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

/** Averages each macro across a set of daily totals (e.g. a 7-day window). Divides by the
 * array's own length, not a fixed window size -- callers control the window by what they pass in.
 * Zeroes (not NaN) for an empty array. The result's `date` carries no meaning here -- it's not
 * a single day -- callers that need a label set their own. */
export function averageDailyTotals(totals: DailyMacroTotals[]): DailyMacroTotals {
  const count = totals.length;
  if (count === 0) {
    return { date: "", calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 };
  }
  const sum = totals.reduce(
    (acc, t) => ({
      calories: acc.calories + t.calories,
      proteinG: acc.proteinG + t.proteinG,
      totalCarbG: acc.totalCarbG + t.totalCarbG,
      totalFatG: acc.totalFatG + t.totalFatG,
    }),
    { calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 },
  );
  return {
    date: "",
    calories: sum.calories / count,
    proteinG: sum.proteinG / count,
    totalCarbG: sum.totalCarbG / count,
    totalFatG: sum.totalFatG / count,
  };
}

export function isoDateOf(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}
