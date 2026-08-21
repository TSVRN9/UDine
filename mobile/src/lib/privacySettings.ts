import { hallCompletion, rankDiningHalls, type LogEntry, type RankedDish, type RankedFood, type SharedStatField } from "@udine/shared";
import { buildTopFoods } from "./youPaneFormat";

// Matches YouPane's own TOP_FOODS_LIMIT -- a friend who opts a stat in sees exactly what the owner
// sees on their own You pane, not a longer or differently-cropped list.
const TOP_FOODS_SHARE_LIMIT = 5;

export interface SharedCompletionEntry {
  hallTid: number;
  loggedDistinct: number;
  seenDistinct: number;
}

export interface SharedTopFoodEntry {
  dishName: string;
  score: number;
  hallName: string | null;
}

export interface SharedHallRankEntry {
  hallTid: number;
  rank: number;
}

export interface DerivedSharedStats {
  completion: SharedCompletionEntry[];
  topFoods: SharedTopFoodEntry[];
  hallRanks: SharedHallRankEntry[];
}

/**
 * Computes the three privacy-settings-gated payloads from the same device-local sources YouPane
 * already reads (seenDishesStorage, logStorage, rankingStorage) -- the "current derived stat" #94
 * pushes on opt-in and re-pushes on every focus for an already-opted-in field. Each payload is a
 * deliberately smaller cut than what YouPane renders for the owner themselves:
 *
 * - completion drops shared's own `pct` (recomputed on render via youPaneFormat's
 *   displayCompletionPct, so a viewer's math always matches the owner's rounding, not a possibly-
 *   stale stored percentage).
 * - topFoods drops `tone` (viewer-side gold/maroon presentation, not data) and everything
 *   comparisonCount/timestamp-shaped -- #94's own spec: "names+scores only, never counts/history".
 *   hallName stays; it's a location label, not a count or a history entry.
 * - hallRanks is ranking.ts's rankDiningHalls output verbatim (already just hallTid + 1-based rank).
 */
export function deriveSharedStatsPayloads(seenByHall: Map<number, string[]>, allEntries: LogEntry[], rankedDishes: RankedDish[], rankedFoods: RankedFood[]): DerivedSharedStats {
  const completion: SharedCompletionEntry[] = hallCompletion(seenByHall, allEntries).map(({ hallTid, loggedDistinct, seenDistinct }) => ({
    hallTid,
    loggedDistinct,
    seenDistinct,
  }));

  const topFoods: SharedTopFoodEntry[] = buildTopFoods(rankedFoods, rankedDishes, allEntries, TOP_FOODS_SHARE_LIMIT).map(({ dishName, score, hallName }) => ({
    dishName,
    score,
    hallName,
  }));

  const hallRanks: SharedHallRankEntry[] = rankDiningHalls(rankedDishes).ranked;

  return { completion, topFoods, hallRanks };
}

/** The `shared_stats` column name for each privacy-settings field. */
export const SHARED_STAT_FIELDS: readonly SharedStatField[] = ["completion", "top_foods", "hall_ranks"] as const;

/**
 * The value a toggle should push to `shared_stats.<field>`: null on toggle-off (a revoke -- deletes
 * the field, see syncSharedStat's own doc comment), the freshly computed payload on toggle-on.
 * Pulled out of the privacy screen's toggle handler so the on/off branch is covered without mocking
 * Supabase -- the network call itself is a thin, untested wrapper around this, same convention as
 * every other settings screen in this app (see notifications.tsx).
 */
export function sharedStatValueForToggle(field: SharedStatField, next: boolean, derived: DerivedSharedStats): SharedCompletionEntry[] | SharedTopFoodEntry[] | SharedHallRankEntry[] | null {
  if (!next) return null;
  switch (field) {
    case "completion":
      return derived.completion;
    case "top_foods":
      return derived.topFoods;
    case "hall_ranks":
      return derived.hallRanks;
  }
}

/**
 * Which already-opted-in fields (non-null in the caller's existing `shared_stats` row) should be
 * re-pushed with a freshly derived value on this refresh. #94: "toggling on pushes the current
 * derived stat (and future refreshes update it)" -- deliberately excludes any field the row doesn't
 * already have a value for, so a plain refresh (e.g. YouPane regaining focus) can never be the thing
 * that opts a user into a stat they never turned on.
 */
export function fieldsNeedingRefresh(existingRow: { completion: unknown; top_foods: unknown; hall_ranks: unknown } | null): SharedStatField[] {
  if (!existingRow) return [];
  return SHARED_STAT_FIELDS.filter((field) => existingRow[field] !== null && existingRow[field] !== undefined);
}
