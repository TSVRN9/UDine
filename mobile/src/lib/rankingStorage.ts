import type { FoodRankingStorage, RankedDish, RankedFood, RankingStorage } from "@udine/shared";
import { getDb } from "./db";

const KEY = "ranked_dishes";
const FOOD_KEY = "ranked_foods";

/**
 * SQLite-backed RankingStorage and FoodRankingStorage — device-only, always, see CLAUDE.md data
 * residency table. Reuses the existing preferences_kv table (small JSON blobs) rather than new tables.
 */
export class SqliteRankingStorage implements RankingStorage, FoodRankingStorage {
  async getRankedDishes(): Promise<RankedDish[]> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM preferences_kv WHERE key = ?", KEY);
    return row ? JSON.parse(row.value_json) : [];
  }

  async saveRankedDishes(dishes: RankedDish[]): Promise<void> {
    const db = await getDb();
    await db.runAsync("INSERT OR REPLACE INTO preferences_kv (key, value_json) VALUES (?, ?)", KEY, JSON.stringify(dishes));
  }

  async getRankedFoods(): Promise<RankedFood[]> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM preferences_kv WHERE key = ?", FOOD_KEY);
    return row ? JSON.parse(row.value_json) : [];
  }

  async saveRankedFoods(foods: RankedFood[]): Promise<void> {
    const db = await getDb();
    await db.runAsync("INSERT OR REPLACE INTO preferences_kv (key, value_json) VALUES (?, ?)", FOOD_KEY, JSON.stringify(foods));
  }
}
