import type { Favorite, FavoritesStorage } from "@udine/shared";
import { favoriteKey } from "@udine/shared";
import { openDb, STORES } from "./db";

const STORE = STORES.favorites;

/** IndexedDB implementation of FavoritesStorage — see @udine/shared's FavoritesStorage contract. Browser-only. */
export class IndexedDbFavoritesStorage implements FavoritesStorage {
	async addFavorite(favorite: Favorite): Promise<void> {
		const db = await openDb();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, "readwrite");
			tx.objectStore(STORE).put({ key: favoriteKey(favorite), favorite });
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async removeFavorite(favorite: Favorite): Promise<void> {
		const db = await openDb();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, "readwrite");
			tx.objectStore(STORE).delete(favoriteKey(favorite));
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async getFavorites(): Promise<Favorite[]> {
		const db = await openDb();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, "readonly");
			const req = tx.objectStore(STORE).getAll();
			req.onsuccess = () => resolve((req.result as { key: string; favorite: Favorite }[]).map((r) => r.favorite));
			req.onerror = () => reject(req.error);
		});
	}
}
