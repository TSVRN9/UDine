import type { FoodRankingStorage, RankedDish, RankedFood, RankingStorage } from "@udine/shared";
import { openDb, STORES } from "./db";

const STORE = STORES.rankedDishes;
const FOOD_STORE = STORES.rankedFoods;

function dishKey(dish: RankedDish): string {
	return `${dish.dishName}::${dish.hallTid}`;
}

/**
 * IndexedDB implementation of RankingStorage and FoodRankingStorage — device-only, always, see
 * @udine/shared's doc comments on both interfaces. Browser-only.
 */
export class IndexedDbRankingStorage implements RankingStorage, FoodRankingStorage {
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

	async getRankedFoods(): Promise<RankedFood[]> {
		const db = await openDb();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(FOOD_STORE, "readonly");
			const req = tx.objectStore(FOOD_STORE).getAll();
			req.onsuccess = () => resolve(req.result as RankedFood[]);
			req.onerror = () => reject(req.error);
		});
	}

	async saveRankedFoods(foods: RankedFood[]): Promise<void> {
		const db = await openDb();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(FOOD_STORE, "readwrite");
			const store = tx.objectStore(FOOD_STORE);
			store.clear();
			for (const food of foods) {
				store.put(food);
			}
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}
}
