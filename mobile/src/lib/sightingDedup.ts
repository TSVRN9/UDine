import { getDb } from "./db";

/**
 * Device-local mirror of `food_sightings`' server-side `unique(user_id, dish_name, hall_tid,
 * sighted_date)` constraint (supabase/functions/check-favorited-foods/index.ts) — minus `user_id`,
 * since this only runs for a SIGNED-OUT device (see backgroundTask.ts's own doc comment): there's
 * no user to scope by, so the same dish/hall/date pair is deduped per-device instead.
 *
 * `claimSighting` mirrors the server's own dedup idiom exactly: an `INSERT OR IGNORE` (server:
 * `.upsert(..., { ignoreDuplicates: true })`), true only when this call's row is the one that
 * actually landed. Callers use that boolean to decide "is this notification actually new", the
 * same way check-favorited-foods/index.ts gates `newSightingsList.push(...)` on `upserted?.length`.
 * One atomic statement, not a separate has-then-insert pair — no window for two overlapping
 * background-task runs to both see "not yet claimed" and both fire a notification.
 *
 * ponytail: unbounded — one row accumulates per (dish, hall, date) ever matched, forever, same
 * shape as menuHoursCache.ts's own menu-cache rows (see that file's identical note). Fine at this
 * volume (a handful of favorited dishes × halls × days); add pruning (delete rows past some age)
 * if this ever shows up as real storage pressure.
 */
export async function claimSighting(dishName: string, hallTid: number, sightedDate: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.runAsync("INSERT OR IGNORE INTO food_sighting_dedup (dish_name, hall_tid, sighted_date) VALUES (?, ?, ?)", dishName, hallTid, sightedDate);
  return result.changes > 0;
}

/**
 * Per-tid sighting counts for a signed-out device (hallSpottedCounts.ts's signed-out data source).
 * Raw `hall_tid`s as claimed -- a Grab 'N Go tid is NOT rolled into its parent hall here, that's
 * hallSpottedCounts.ts's job (shared with the signed-in `food_sightings` path, so it isn't done
 * twice). One GROUP BY query, not a getAllAsync + manual reduce -- SQLite already does this.
 */
export async function countsByHallToday(date: string): Promise<Map<number, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ hall_tid: number; count: number }>(
    "SELECT hall_tid, COUNT(*) as count FROM food_sighting_dedup WHERE sighted_date = ? GROUP BY hall_tid",
    date,
  );
  return new Map(rows.map((row) => [row.hall_tid, row.count]));
}
