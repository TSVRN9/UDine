import type { LogStorage, NutritionFacts } from "@udine/shared";

/**
 * One previously-logged UMass dining hall dish, enough to stage it back onto the plate --
 * `nutrition` is the per-serving snapshot from whichever LogEntry it was deduped from (see
 * getLoggedUmassDishHistory), the same convention menuItemToPlateEntry/toLogEntries already use
 * (LogEntry.nutrition is per-serving; computeDailyTotals is what multiplies by servings).
 */
export interface HistoryDish {
  dishName: string;
  hallTid: number;
  nutrition: NutritionFacts;
}

/**
 * Dining halls don't always list everything they serve on a given day's menu -- this searches the
 * device's own log history for umass-menu-sourced dishes the user has logged before (even off
 * today's menu), so they can add one to the plate without it being scraped again. Deliberately NOT
 * backed by seenDishesStorage/seen_dishes -- that store has no nutrition data, so a hit from it
 * couldn't be turned back into a plate entry.
 *
 * Dedupes by dishName, keeping the most recent occurrence's nutrition (a dish's nutrition can drift
 * day to day, so the freshest snapshot is the best guess for "what it probably is today").
 */
export async function getLoggedUmassDishHistory(storage: LogStorage, query: string): Promise<HistoryDish[]> {
  // ponytail: full scan of log_entries per keystroke-search, dedup/filter done in JS rather than
  // SQL -- fine at the row counts one device's own log ever reaches. If this ever shows up as slow,
  // push the dishName LIKE filter and a MAX(logged_at)-per-dishName dedup down into SQL instead.
  const entries = await storage.getAllEntries();
  const q = query.trim().toLowerCase();

  const mostRecentByDish = new Map<string, { loggedAt: string; dish: HistoryDish }>();
  for (const entry of entries) {
    if (entry.source.type !== "umass-menu") continue;
    const { dishName, hallTid } = entry.source;
    const existing = mostRecentByDish.get(dishName);
    if (existing && existing.loggedAt >= entry.loggedAt) continue;
    mostRecentByDish.set(dishName, { loggedAt: entry.loggedAt, dish: { dishName, hallTid, nutrition: entry.nutrition } });
  }

  return [...mostRecentByDish.values()].map((v) => v.dish).filter((dish) => dish.dishName.toLowerCase().includes(q));
}
