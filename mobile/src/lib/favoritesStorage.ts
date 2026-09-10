import { useCallback, useRef } from "react";
import type { Favorite, FavoritesStorage } from "@udine/shared";
import { favoriteKey } from "@udine/shared";
import { getDb } from "./db";

/** SQLite-backed FavoritesStorage — device-only for anonymous users, see CLAUDE.md data residency table. */
export class SqliteFavoritesStorage implements FavoritesStorage {
  async addFavorite(favorite: Favorite): Promise<void> {
    const db = await getDb();
    await db.runAsync("INSERT OR REPLACE INTO favorites (key, favorite_json) VALUES (?, ?)", favoriteKey(favorite), JSON.stringify(favorite));
  }

  async removeFavorite(favorite: Favorite): Promise<void> {
    const db = await getDb();
    await db.runAsync("DELETE FROM favorites WHERE key = ?", favoriteKey(favorite));
  }

  async getFavorites(): Promise<Favorite[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ favorite_json: string }>("SELECT favorite_json FROM favorites");
    return rows.map((r) => JSON.parse(r.favorite_json));
  }
}

/**
 * #198: halls/[slug].tsx and grab-n-go/[slug].tsx had byte-for-byte identical toggleDishFavorite
 * bodies that decided add-vs-remove from the render-closure `favoriteDishKeys` state -- a second tap
 * on the same star landing before the first toggle's storage round-trip committed a fresh
 * setFavoriteDishKeys read the same stale value as the first tap, so both took the same branch
 * (e.g. add-then-add) instead of toggling back. Same stepper-class bug as #147's LOG guard --
 * one shared, guarded implementation instead of the guard living (or not) in each copy separately.
 *
 * Guarded per favorite key (not one global lock like useGuardedLogPlate) so toggling one dish's star
 * never blocks an unrelated one still mid-flight. Drops a second call outright for the SAME key
 * while its first is in flight, rather than queuing it -- same "drop, don't queue" call rank.tsx's
 * choose() landed on for this exact stale-closure question (PR #159 review).
 */
export function useGuardedToggleFavorite(storage: FavoritesStorage, onUpdate: (favorites: Favorite[]) => void) {
  const inFlight = useRef<Set<string>>(new Set());
  // useCallback, not a plain returned closure -- callers (e.g. halls/[slug].tsx's renderDishRow)
  // wrap handlers that call this in their own useCallback for SectionList row-memoization; a fresh
  // function identity here every render would propagate through and defeat that.
  return useCallback(
    async function toggleFavorite(favorite: Favorite, currentlyFavorited: boolean): Promise<void> {
      const key = favoriteKey(favorite);
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);
      try {
        if (currentlyFavorited) await storage.removeFavorite(favorite);
        else await storage.addFavorite(favorite);
        onUpdate(await storage.getFavorites());
      } finally {
        inFlight.current.delete(key);
      }
    },
    [storage, onUpdate],
  );
}
