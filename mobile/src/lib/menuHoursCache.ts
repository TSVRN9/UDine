import { fetchDiningHours, type DiningHoursFeed, type MenuItem } from "@udine/shared";
import { getDb } from "./db";
import { recordRetailNames } from "./retailHallNames";

/**
 * #181's ticket-owned prerequisite: a device-local PERSISTENT menu/hours cache. #170's fetchMenu
 * TTL cache (shared/src/umassDining.ts) is process-lifetime only -- it evaporates on every cold
 * start, so it can't back an "offline, render from cache" screen. This sits underneath it, in
 * mobile only (residency table: menu cache is device-only, no new server surface -- SQLite here,
 * same as every other device-local table).
 *
 * Reuses the existing `preferences_kv` table (small JSON blobs) rather than adding new tables --
 * same call seenDishesStorage.ts already made for exactly this shape. Unlike that file's one-big-
 * JSON-object-per-row design, though, this is ONE ROW PER (hallTid, date) menu entry, keyed
 * `menu_cache:<tid>|<date>` (#181 review finding 5): a hall-menu day's worth of nutrition payloads
 * is the largest single value in this table, and the date stepper lets a session accumulate many
 * of them. A single shared JSON blob would mean every save/read parses+stringifies the WHOLE
 * accumulated cache on the JS thread, a read-modify-write that grows without bound as more
 * (hall, date) pairs get visited. Per-entry rows turn every save into a single `INSERT OR REPLACE`
 * (no read-modify-write at all) and every read into a single-row lookup by exact key -- no RMW race
 * either, so (unlike pingQueue.ts's queue) this doesn't need write serialization.
 *
 * ponytail: still unbounded -- one row accumulates per (hallTid, date) ever viewed, forever. Fine
 * at this volume (a handful of halls x a handful of recently-browsed dates); add pruning (delete
 * rows past some age, or cap to the last N) if this ever shows up as real storage pressure. Hours
 * cache stays the single-row shape (`hours_cache:v1`, one hall-wide snapshot, no per-key growth).
 */
const MENU_KEY_PREFIX = "menu_cache:";
const HOURS_KEY = "hours_cache:v1";

// #181 review finding 6: schema version tag on both persisted shapes. Without it, an app upgrade
// that changes MenuItem's or DiningHoursFeed's fields would parse an old cached blob as if it were
// the current shape -- wrong types reaching the UI, not a clean cache miss. `CACHE_VERSION` is
// bumped whenever either shape changes; a stored blob with a different (or missing) `v` is treated
// as absent rather than trusted.
const CACHE_VERSION = 1;

export interface CachedMenu {
  items: MenuItem[];
  fetchedAt: string; // ISO 8601
}

export interface CachedHours {
  feed: DiningHoursFeed;
  fetchedAt: string; // ISO 8601
}

interface Versioned<T> {
  v: number;
  data: T;
}

function menuCacheKey(hallTid: number, date: Date): string {
  // Local calendar day, not UTC -- same trap nowLocalIso/hours.ts's own doc calls out; a date
  // picked in the evening under a negative-UTC-offset zone must key on the day the user sees.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${MENU_KEY_PREFIX}${hallTid}|${y}-${m}-${d}`;
}

async function readVersioned<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM preferences_kv WHERE key = ?", key);
  if (!row) return null;
  const parsed: Versioned<T> = JSON.parse(row.value_json);
  return parsed.v === CACHE_VERSION ? parsed.data : null; // stale schema -- treat as absent, not a crash
}

async function writeVersioned<T>(key: string, data: T): Promise<void> {
  const db = await getDb();
  const payload: Versioned<T> = { v: CACHE_VERSION, data };
  await db.runAsync("INSERT OR REPLACE INTO preferences_kv (key, value_json) VALUES (?, ?)", key, JSON.stringify(payload));
}

export async function saveCachedMenu(hallTid: number, date: Date, items: MenuItem[]): Promise<void> {
  await writeVersioned<CachedMenu>(menuCacheKey(hallTid, date), { items, fetchedAt: new Date().toISOString() });
}

export async function getCachedMenu(hallTid: number, date: Date): Promise<CachedMenu | null> {
  return readVersioned<CachedMenu>(menuCacheKey(hallTid, date));
}

export async function saveCachedHours(feed: DiningHoursFeed): Promise<void> {
  await writeVersioned<CachedHours>(HOURS_KEY, { feed, fetchedAt: new Date().toISOString() });
}

export async function getCachedHours(): Promise<CachedHours | null> {
  const cached = await readVersioned<CachedHours>(HOURS_KEY);
  // #243 bug A: a cache HIT is a real DiningHoursFeed too -- an offline device that never
  // reaches fetchHoursAndCache's own success branch below still needs retailHallNames.ts's
  // tid->name map populated from whatever feed it does get, or café labels fall back to
  // "Hall <tid>" for the entire offline session.
  if (cached) recordRetailNames(cached.feed.retail);
  return cached;
}

/**
 * Write-through wrapper around shared's fetchDiningHours -- the hours-side analogue of
 * menuFetchWithSeenTracking.ts's fetchMenuAndRecordSeen. On success, caches the feed
 * fire-and-forget (same "must never block/fail the caller's own await" reasoning as that file's
 * recordSeen call); on failure, does NOT touch the cache, so the last good copy survives a
 * transient failure. Callers needing the offline fallback read getCachedHours() directly.
 */
export async function fetchHoursAndCache(): Promise<DiningHoursFeed> {
  const feed = await fetchDiningHours();
  saveCachedHours(feed).catch(() => {});
  recordRetailNames(feed.retail); // #243 bug A -- live half of the tid->name wiring, see getCachedHours
  return feed;
}
