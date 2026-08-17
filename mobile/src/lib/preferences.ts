import type { FoodPreferences } from "@udine/shared";
import { getDb } from "./db";

const KEY = "food_preferences";
const DEFAULT: FoodPreferences = { allergensToAvoid: [], requiredDietTags: [] };

export async function getPreferences(): Promise<FoodPreferences> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM preferences_kv WHERE key = ?", KEY);
  return row ? JSON.parse(row.value_json) : DEFAULT;
}

export async function setPreferences(prefs: FoodPreferences): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO preferences_kv (key, value_json) VALUES (?, ?)", KEY, JSON.stringify(prefs));
}
