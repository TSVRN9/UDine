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
 * that opts a user into a stat they never turned on. #248 Part C's one-time default-on seed (see
 * shouldSeedSharedStatsDefault below) is the one sanctioned exception to that rule -- it's a
 * separate, explicitly-gated code path in privacy.tsx, not a change to this function.
 */
export function fieldsNeedingRefresh(existingRow: { completion: unknown; top_foods: unknown; hall_ranks: unknown } | null): SharedStatField[] {
  if (!existingRow) return [];
  return SHARED_STAT_FIELDS.filter((field) => existingRow[field] !== null && existingRow[field] !== undefined);
}

// #248 Part C (owner decision 2026-08-25/26, reversing epic #87's 2026-08-19 "default all off" law
// -- see CLAUDE.md's data-residency table for the full decision): the three shared_stats toggles
// default ON, but only for accounts created on/after this date -- existing accounts keep whatever
// they have today (the "new accounts only" existing-user story, not a backfill).
const SHARED_STATS_DEFAULT_ON_SHIP_DATE = new Date("2026-08-26T00:00:00Z");

/** True iff `createdAt` (a Supabase auth `User.created_at` ISO string) is on/after the ship date
 * above. Fails closed (false) on a missing/unparseable value -- never defaults a user on when this
 * can't prove they're new (jest's `TZ=America/New_York` makes the explicit `Z` above load-bearing:
 * a local-time constant would shift the cutoff by hours). */
export function isNewAccountForSharedStatsDefault(createdAt: string | undefined): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return t >= SHARED_STATS_DEFAULT_ON_SHIP_DATE.getTime();
}

/**
 * Should this refresh run the one-time default-on seed (push all three fields ON, see privacy.tsx's
 * refresh())? Pure decision, three independent gates all required:
 *  - `row === null`: no shared_stats row exists yet. A row that exists with every column null (a
 *    user who opted in and then turned everything back off) must NOT re-seed -- that's what makes
 *    this check `row === null` and not "every field is null".
 *  - `isNewAccountForSharedStatsDefault`: the "new accounts only" existing-user story -- a
 *    never-opted-in EXISTING account also has a null row, and must not be swept in by row-absence
 *    alone.
 *  - `!alreadySeeded`: the persisted per-user marker (mobile/src/lib/sharedStatsSeed.ts). Exists
 *    because "Delete server data" deletes the shared_stats row entirely -- without this, a re-focus
 *    after deleting would see `row === null` again and resurrect exactly what the user just
 *    explicitly removed.
 */
export function shouldSeedSharedStatsDefault(opts: { row: { completion: unknown; top_foods: unknown; hall_ranks: unknown } | null; createdAt: string | undefined; alreadySeeded: boolean }): boolean {
  return opts.row === null && !opts.alreadySeeded && isNewAccountForSharedStatsDefault(opts.createdAt);
}
