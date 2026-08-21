import { fetchMenu, type MenuItem } from "@udine/shared";
import { SqliteSeenDishesStorage } from "./seenDishesStorage";

const seenDishesStorage = new SqliteSeenDishesStorage();

/**
 * Wraps shared's fetchMenu to also record every distinct dish name it returns as "seen" at that
 * hall (#89's SeenDishesStorage — the denominator behind You pane's HALL COMPLETION bars, #92).
 * Wired into halls/[slug].tsx by #107 — that screen calls fetchMenuAndRecordSeen here instead of
 * shared's fetchMenu directly, so browsing a hall's menu marks its dishes seen.
 *
 * recordSeen is fire-and-forget, not awaited: this bookkeeping write must never block or fail the
 * menu the caller actually asked for (PR #123 review) — a locked/full-disk SQLite write shouldn't
 * take out the hall-menu screen to protect a progress bar's denominator. Same principle the
 * sibling fetchDiningHours call already follows one screen over.
 */
export async function fetchMenuAndRecordSeen(hallTid: number, date: Date): Promise<MenuItem[]> {
  const items = await fetchMenu(hallTid, date);
  const dishNames = [...new Set(items.map((item) => item.dishName))];
  if (dishNames.length > 0) seenDishesStorage.recordSeen(hallTid, dishNames).catch(() => {});
  return items;
}
