import { fetchMenu, type MenuItem } from "@udine/shared";
import { SqliteSeenDishesStorage } from "./seenDishesStorage";

const seenDishesStorage = new SqliteSeenDishesStorage();

/**
 * Wraps shared's fetchMenu to also record every distinct dish name it returns as "seen" at that
 * hall (#89's SeenDishesStorage — the denominator behind You pane's HALL COMPLETION bars, #92).
 * Wired into halls/[slug].tsx by #107 — that screen calls fetchMenuAndRecordSeen here instead of
 * shared's fetchMenu directly, so browsing a hall's menu marks its dishes seen.
 */
export async function fetchMenuAndRecordSeen(hallTid: number, date: Date): Promise<MenuItem[]> {
  const items = await fetchMenu(hallTid, date);
  const dishNames = [...new Set(items.map((item) => item.dishName))];
  if (dishNames.length > 0) await seenDishesStorage.recordSeen(hallTid, dishNames);
  return items;
}
