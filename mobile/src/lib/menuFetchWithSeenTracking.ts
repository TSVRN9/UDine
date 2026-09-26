import { fetchMenu, type MenuItem } from "@udine/shared";
import { getCachedMenu, isMenuCacheFinal, saveCachedMenu } from "./menuHoursCache";
import { SqliteSeenDishesStorage } from "./seenDishesStorage";

const seenDishesStorage = new SqliteSeenDishesStorage();

/**
 * Wraps shared's fetchMenu to also record every distinct dish name it returns as "seen" at that
 * hall (the denominator behind You pane's HALL COMPLETION bars), and persist the result to the
 * device-local menu cache so a later fetch failure has a saved copy to fall back to. Wired into
 * halls/[slug].tsx, which calls fetchMenuAndRecordSeen here instead of shared's fetchMenu directly,
 * so browsing a hall's menu marks its dishes seen and refreshes the cache.
 *
 * Both the seen-dish write and the cache write are fire-and-forget, not awaited: neither
 * bookkeeping write must ever block or fail the menu the caller actually asked for — a
 * locked/full-disk SQLite write shouldn't take out the hall-menu screen to protect a progress bar's
 * denominator or a cache entry. Same principle the sibling fetchDiningHours call already follows
 * one screen over.
 */
export async function fetchMenuAndRecordSeen(hallTid: number, date: Date): Promise<MenuItem[]> {
  const items = await fetchMenu(hallTid, date);
  const dishNames = [...new Set(items.map((item) => item.dishName))];
  if (dishNames.length > 0) seenDishesStorage.recordSeen(hallTid, dishNames).catch(() => {});
  saveCachedMenu(hallTid, date, items).catch(() => {});
  return items;
}

/**
 * Cache-first menu load for the offline-first hall screen (brief: docs/briefs/offline-menus-and-
 * search.md, task 1). Delivers a cached copy through `onItems` immediately if one exists (and
 * records it seen, same as a live fetch, so a cache-only session still feeds HALL COMPLETION),
 * then either stops there (the cache is final -- owner's model: a day's menu doesn't change once
 * that day has started) or goes to the network in the background and delivers a fresh result
 * through `onItems` too.
 *
 * No `withTimeout` on the network call, deliberately (see the brief's Rationale) -- a per-fetch
 * timeout would abandon a slow-but-eventually-successful fetch. The caller (halls/[slug].tsx) is
 * the one that needs a "don't wait forever" heuristic for ITS OWN loading UI when there's no
 * cache to show meanwhile, and it gets that by racing this promise against its own timer, not by
 * this function ever giving up on the fetch.
 *
 * Rejects only when nothing was ever delivered AND the fetch failed -- a cache hit (final or not)
 * already gave the caller something to render, so a subsequent background-fetch failure there is
 * silent (same "last good copy survives a transient failure" rule saveCachedMenu's own empty-write
 * guard follows), not surfaced as an error.
 *
 * A cached `[]` doesn't count as "delivered" -- same reasoning as saveCachedMenu's guard: an empty
 * row is never trusted as the real answer over a fetch that might still find real items. And once
 * a non-empty result (cached or fresh) HAS been delivered, a later empty fetch result is dropped
 * rather than passed to `onItems` -- it would only ever be the same kind of transient scrape glitch
 * saveCachedMenu already refuses to persist, and flashing the screen from a menu to empty is worse
 * than briefly showing a fresh copy a beat late next reload.
 */
export async function loadMenuCacheFirst(hallTid: number, date: Date, onItems: (items: MenuItem[]) => void): Promise<void> {
  const cached = await getCachedMenu(hallTid, date).catch(() => null);
  let delivered = false;
  if (cached && cached.items.length > 0) {
    const dishNames = [...new Set(cached.items.map((item) => item.dishName))];
    if (dishNames.length > 0) seenDishesStorage.recordSeen(hallTid, dishNames).catch(() => {});
    onItems(cached.items);
    delivered = true;
    if (isMenuCacheFinal(cached, date)) return;
  }
  try {
    const fresh = await fetchMenuAndRecordSeen(hallTid, date);
    if (fresh.length > 0 || !delivered) onItems(fresh);
  } catch (e) {
    if (!delivered) throw e;
  }
}
