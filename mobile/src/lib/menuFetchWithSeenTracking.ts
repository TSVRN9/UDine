import { fetchMenu, type MenuItem } from "@udine/shared";
import { SqliteSeenDishesStorage } from "./seenDishesStorage";

const seenDishesStorage = new SqliteSeenDishesStorage();

/**
 * Wraps shared's fetchMenu to also record every distinct dish name it returns as "seen" at that
 * hall (#89's SeenDishesStorage — the denominator behind You pane's HALL COMPLETION bars, #92).
 * File ownership note (#92's dispatch): the only real menu-fetch call site is currently
 * halls/[slug].tsx, owned by #91 — this file exists so #92 doesn't edit that screen directly. #91
 * should call fetchMenuAndRecordSeen here instead of shared's fetchMenu directly once it lands;
 * until then, HALL COMPLETION reads back empty (0/0 for every hall), which is expected, not a bug.
 */
export async function fetchMenuAndRecordSeen(hallTid: number, date: Date): Promise<MenuItem[]> {
  const items = await fetchMenu(hallTid, date);
  const dishNames = [...new Set(items.map((item) => item.dishName))];
  if (dishNames.length > 0) await seenDishesStorage.recordSeen(hallTid, dishNames);
  return items;
}
