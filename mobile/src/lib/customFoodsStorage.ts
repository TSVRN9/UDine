import type { CustomFood, CustomFoodsStorage } from "@udine/shared";
import { getDb } from "./db";

/** SQLite-backed CustomFoodsStorage -- device-only, always, see CLAUDE.md data residency table
 * (custom foods are user-typed, no database backs them, never touch Supabase). Same shape as
 * SqliteFavoritesStorage. */
export class SqliteCustomFoodsStorage implements CustomFoodsStorage {
  async addCustomFood(food: CustomFood): Promise<void> {
    const db = await getDb();
    await db.runAsync("INSERT OR REPLACE INTO custom_foods (id, food_json) VALUES (?, ?)", food.id, JSON.stringify(food));
  }

  async removeCustomFood(id: string): Promise<void> {
    const db = await getDb();
    await db.runAsync("DELETE FROM custom_foods WHERE id = ?", id);
  }

  async getAllCustomFoods(): Promise<CustomFood[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ food_json: string }>("SELECT food_json FROM custom_foods");
    return rows.map((r) => JSON.parse(r.food_json));
  }
}

/** Case-insensitive substring match on name -- same spirit/shape as dishCatalog.ts's
 * searchCachedDishes, the 4th source PlateSheet's merged search filters this way. */
export function searchCustomFoods(foods: CustomFood[], query: string): CustomFood[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return foods.filter((f) => f.name.toLowerCase().includes(q));
}
