import type { RankedDish, RankingStorage } from "@udine/shared";
import { openDb, STORES } from "./db";

const STORE = STORES.rankedDishes;

function dishKey(dish: RankedDish): string {
	return `${dish.dishName}::${dish.hallTid}`;
}

/** IndexedDB implementation of RankingStorage — device-only, always, see @udine/shared's RankingStorage doc comment. Browser-only. */
export class IndexedDbRankingStorage implements RankingStorage {
	async getRankedDishes(): Promise<RankedDish[]> {
		const db = await openDb();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, "readonly");
			const req = tx.objectStore(STORE).getAll();
			req.onsuccess = () => resolve((req.result as { key: string; dish: RankedDish }[]).map((r) => r.dish));
			req.onerror = () => reject(req.error);
		});
	}

	async saveRankedDishes(dishes: RankedDish[]): Promise<void> {
		const db = await openDb();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, "readwrite");
			const store = tx.objectStore(STORE);
			store.clear();
			for (const dish of dishes) {
				store.put({ key: dishKey(dish), dish });
			}
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}
}
