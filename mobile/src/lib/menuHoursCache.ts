import { fetchDiningHours, type DiningHoursFeed, type MenuItem } from "@udine/shared";
import { getDb } from "./db";

/**
 * #181's ticket-owned prerequisite: a device-local PERSISTENT menu/hours cache. #170's fetchMenu
 * TTL cache (shared/src/umassDining.ts) is process-lifetime only -- it evaporates on every cold
 * start, so it can't back an "offline, render from cache" screen. This sits underneath it, in
 * mobile only (residency table: menu cache is device-only, no new server surface -- SQLite here,
 * same as every other device-local table).
 *
 * Reuses the existing `preferences_kv` table (small JSON blobs) rather than adding new tables --
 * same call seenDishesStorage.ts already made for exactly this shape (one KV row per logical
 * namespace, JSON blob value). No schema migration needed.
 *
 * ponytail: menu_cache accumulates one entry per (hallTid, date) ever viewed, unbounded -- fine at
 * this volume (a handful of halls x a handful of recently-browsed dates, JSON menu payloads, not
 * huge), same unbounded-KV-row precedent seenDishesStorage already sets. Add pruning (oldest N,
 * or an explicit TTL sweep) if this ever shows up as real storage pressure.
 */
const MENU_KEY = "menu_cache";
const HOURS_KEY = "hours_cache";

export interface CachedMenu {
  items: MenuItem[];
  fetchedAt: string; // ISO 8601
}

export interface CachedHours {
  feed: DiningHoursFeed;
  fetchedAt: string; // ISO 8601
}

function menuCacheKey(hallTid: number, date: Date): string {
  // Local calendar day, not UTC -- same trap nowLocalIso/hours.ts's own doc calls out; a date
  // picked in the evening under a negative-UTC-offset zone must key on the day the user sees.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${hallTid}|${y}-${m}-${d}`;
}

export async function saveCachedMenu(hallTid: number, date: Date, items: MenuItem[]): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM preferences_kv WHERE key = ?", MENU_KEY);
  const byKey: Record<string, CachedMenu> = row ? JSON.parse(row.value_json) : {};
  byKey[menuCacheKey(hallTid, date)] = { items, fetchedAt: new Date().toISOString() };
  await db.runAsync("INSERT OR REPLACE INTO preferences_kv (key, value_json) VALUES (?, ?)", MENU_KEY, JSON.stringify(byKey));
}

export async function getCachedMenu(hallTid: number, date: Date): Promise<CachedMenu | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM preferences_kv WHERE key = ?", MENU_KEY);
  if (!row) return null;
  const byKey: Record<string, CachedMenu> = JSON.parse(row.value_json);
  return byKey[menuCacheKey(hallTid, date)] ?? null;
}

export async function saveCachedHours(feed: DiningHoursFeed): Promise<void> {
  const db = await getDb();
  const cached: CachedHours = { feed, fetchedAt: new Date().toISOString() };
  await db.runAsync("INSERT OR REPLACE INTO preferences_kv (key, value_json) VALUES (?, ?)", HOURS_KEY, JSON.stringify(cached));
}

export async function getCachedHours(): Promise<CachedHours | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM preferences_kv WHERE key = ?", HOURS_KEY);
  return row ? JSON.parse(row.value_json) : null;
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
  return feed;
}
