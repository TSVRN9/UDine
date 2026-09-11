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
 * device's own log history for umass-menu-sourced dishes the user has logged before at THIS hall
 * (even off today's menu), so they can add one to the plate without it being scraped again.
 * Deliberately NOT backed by seenDishesStorage/seen_dishes -- that store has no nutrition data, so
 * a hit from it couldn't be turned back into a plate entry.
 *
 * Scoped to `hallTid` (the hall currently being browsed), not cross-hall -- a staged HistoryDish
 * carries its original hallTid forward (see historyDishToPlateEntry), and that hallTid feeds
 * shared/src/completion.ts's hallCompletion and shared/src/ranking.ts's dish ranking/favorite-hall
 * derivation, both of which can sync server-side. Two halls sharing an identical dish name would
 * otherwise misattribute hall-completion/favorite-hall credit if dedup ever crossed halls.
 *
 * Dedupes by dishName (within this hall), keeping the most recent occurrence's nutrition (a dish's
 * nutrition can drift day to day, so the freshest snapshot is the best guess for "what it probably
 * is today").
 */
export async function getLoggedUmassDishHistory(storage: LogStorage, hallTid: number, query: string): Promise<HistoryDish[]> {
  // ponytail: full scan of log_entries per keystroke-search, dedup/filter done in JS rather than
  // SQL -- fine at the row counts one device's own log ever reaches. If this ever shows up as slow,
  // push the hallTid + dishName LIKE filter and a MAX(logged_at)-per-dishName dedup down into SQL
  // instead.
  const entries = await storage.getAllEntries();
  const q = query.trim().toLowerCase();

  const mostRecentByDish = new Map<string, { loggedAt: string; dish: HistoryDish }>();
  for (const entry of entries) {
    if (entry.source.type !== "umass-menu" || entry.source.hallTid !== hallTid) continue;
    const { dishName } = entry.source;
    const existing = mostRecentByDish.get(dishName);
    if (existing && existing.loggedAt >= entry.loggedAt) continue;
    mostRecentByDish.set(dishName, { loggedAt: entry.loggedAt, dish: { dishName, hallTid, nutrition: entry.nutrition } });
  }

  return [...mostRecentByDish.values()].map((v) => v.dish).filter((dish) => dish.dishName.toLowerCase().includes(q));
}
