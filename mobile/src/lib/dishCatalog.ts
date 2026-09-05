import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchDishCatalog, type DishCatalogEntry } from "@udine/shared";
import { getDb } from "./db";

/**
 * Local cache of the server-side dish nutrition catalog (public.dishes, see shared/src/dishes.ts)
 * -- same single-blob shape as menuHoursCache.ts's CachedHours (one whole-app-wide collection, not
 * partitioned per hall/date like CachedMenu). Read/write helpers duplicated from menuHoursCache.ts
 * rather than imported -- that file doesn't export readVersioned/writeVersioned.
 */
const CATALOG_KEY = "dish_catalog:v1";
const CACHE_VERSION = 1;

export interface CachedDishCatalog {
  entries: DishCatalogEntry[];
  lastSyncedAt: string; // ISO 8601 -- passed as `updatedSince` on the next delta fetch
}

interface Versioned<T> {
  v: number;
  data: T;
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

export async function getCachedDishCatalog(): Promise<CachedDishCatalog | null> {
  return readVersioned<CachedDishCatalog>(CATALOG_KEY);
}

/**
 * Refreshes the local catalog cache if missing or older than `maxAgeMs`. Merges the fetched
 * entries into the existing cache keyed by dishName (new/updated rows overwrite old ones by name;
 * nothing is ever deleted locally even if a dish disappears from a later sync -- a stale nutrition
 * fact for a discontinued dish is harmless). Fetch errors are swallowed (logged, not thrown) -- a
 * failed background refresh must never break whatever screen triggered it.
 */
export async function refreshDishCatalogIfStale(supabase: SupabaseClient, maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
  try {
    const cache = await getCachedDishCatalog();
    if (cache && Date.now() - new Date(cache.lastSyncedAt).getTime() < maxAgeMs) return;

    const fetched = await fetchDishCatalog(supabase, cache?.lastSyncedAt);
    const byName = new Map((cache?.entries ?? []).map((e) => [e.dishName, e]));
    for (const entry of fetched) byName.set(entry.dishName, entry);

    await writeVersioned<CachedDishCatalog>(CATALOG_KEY, { entries: [...byName.values()], lastSyncedAt: new Date().toISOString() });
  } catch (e) {
    console.warn("refreshDishCatalogIfStale failed", e);
  }
}

/** Case-insensitive substring match on dishName -- synchronous/local, no network, instant. */
export function searchCachedDishes(catalog: CachedDishCatalog | null, query: string): DishCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q || !catalog) return [];
  return catalog.entries.filter((e) => e.dishName.toLowerCase().includes(q));
}
