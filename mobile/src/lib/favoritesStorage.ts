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
