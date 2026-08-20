import { DINING_HALLS, rankFoods, scoreOutOfTen, type HallCompletion, type LogEntry, type RankedDish, type RankedFood } from "@udine/shared";

/**
 * Carry-over note 3 (#92, from #97's review): shared's HallCompletion.pct rounds half-up
 * (Math.round), so e.g. 199/200 seen dishes logged reads back as pct 100 even though one dish is
 * still unlogged. Recomputed from the raw counts with Math.floor instead — feeds both the bar's
 * fill width and its numeric label, so "100%" only ever appears once loggedDistinct === seenDistinct.
 */
export function displayCompletionPct(c: Pick<HallCompletion, "loggedDistinct" | "seenDistinct">): number {
  return c.seenDistinct === 0 ? 0 : Math.floor((100 * c.loggedDistinct) / c.seenDistinct);
}

/** Gold for every food tied at the top score, maroon otherwise — canvas spec. */
export function pillTone(score: number, maxScore: number): "gold" | "maroon" {
  return score === maxScore ? "gold" : "maroon";
}

/**
 * Carry-over note 4: RankedFood scores are cross-hall (identity by dishName alone — see
 * docs/adr/0001), but the canvas shows a hall label next to each top food. Derived presentationally,
 * not part of the score: the highest-rated per-hall RankedDish sharing that name, or (if this device
 * never compared that dish at any hall — shouldn't normally happen, since a food comparison always
 * updates the matching RankedDish too, but logged-without-yet-compared is possible) the hall of the
 * most recent log entry for that dish name. Null if neither source has it.
 */
export function deriveTopFoodHall(dishName: string, rankedDishes: RankedDish[], logEntries: LogEntry[]): number | null {
  const candidates = rankedDishes.filter((d) => d.dishName === dishName);
  if (candidates.length > 0) {
    return candidates.reduce((best, d) => (d.rating > best.rating ? d : best)).hallTid;
  }
  const logged = logEntries
    .filter((e) => e.source.type === "umass-menu" && e.source.dishName === dishName)
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  const mostRecent = logged[0];
  return mostRecent?.source.type === "umass-menu" ? mostRecent.source.hallTid : null;
}

export interface TopFoodDisplay {
  dishName: string;
  score: number;
  hallName: string | null;
  tone: "gold" | "maroon";
}

/**
 * YOUR TOP FOODS display list: highest-rated foods first, capped at `limit`, each with its 0-10
 * pill score, presentational hall label (deriveTopFoodHall), and pill tone. Foods below
 * scoreOutOfTen's MIN_COMPARISONS_FOR_SCORE gate are excluded — when every rankedFood is below that
 * gate (real comparisons exist, no scores yet), this returns [] even though rankedFoods isn't empty:
 * the "halls ranked, no food scores yet" in-between state from carry-over note 2.
 */
export function buildTopFoods(rankedFoods: RankedFood[], rankedDishes: RankedDish[], logEntries: LogEntry[], limit = 5): TopFoodDisplay[] {
  const scores = scoreOutOfTen(rankedFoods);
  // rankFoods already orders by rating desc, and scoreOutOfTen is monotonic with rating, so filtering
  // preserves score order without a second sort.
  const qualifying = rankFoods(rankedFoods)
    .filter((f) => scores.has(f.dishName))
    .slice(0, limit);
  if (qualifying.length === 0) return [];

  const maxScore = Math.max(...qualifying.map((f) => scores.get(f.dishName)!));
  return qualifying.map((f) => {
    const score = scores.get(f.dishName)!;
    const hallTid = deriveTopFoodHall(f.dishName, rankedDishes, logEntries);
    const hallName = hallTid !== null ? (DINING_HALLS.find((h) => h.tid === hallTid)?.name ?? null) : null;
    return { dishName: f.dishName, score, hallName, tone: pillTone(score, maxScore) };
  });
}
