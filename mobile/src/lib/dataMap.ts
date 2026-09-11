import type { LogEntry, RankedDish, RankedFood } from "@udine/shared";

/**
 * Pure counts + copy for the "Your data" screen's "Stays on this phone" card. Kept out of the
 * screen component so the counting logic is testable without rendering -- same split as
 * privacySettings.ts's deriveSharedStatsPayloads.
 */
export interface DeviceDataCounts {
  logEntryCount: number;
  /** "Dish & food rankings" is one combined row on the artboard covering both device-local
   * ranking stores (per-hall RankedDish + cross-hall RankedFood) -- summed here rather than
   * picking one, since the row's own label names both. */
  rankedCount: number;
  seenDishCount: number;
}

export function deviceDataCounts(entries: LogEntry[], rankedDishes: RankedDish[], rankedFoods: RankedFood[], seenByHall: Map<number, string[]>): DeviceDataCounts {
  let seenDishCount = 0;
  for (const names of seenByHall.values()) seenDishCount += names.length;
  return {
    logEntryCount: entries.length,
    rankedCount: rankedDishes.length + rankedFoods.length,
    seenDishCount,
  };
}

/** "N of these units", per the artboard's `214 entries` / `36 ranked` / `253 dishes` rows. */
export function countLabel(count: number, unit: string): string {
  return `${count} ${unit}`;
}

/** `<email> · N friends`, per the "On UDine's server" profile row. Only `accepted` friendships
 * count as friends -- a pending request isn't one yet (same rule friends.tsx's own UI uses). */
export function acceptedFriendCount(friendships: { status: string }[]): number {
  return friendships.filter((f) => f.status === "accepted").length;
}

export function profileSummaryLine(email: string, friendCount: number): string {
  return `${email} · ${friendCount} friend${friendCount === 1 ? "" : "s"}`;
}

/** `keeps your N favorites on the server to watch menus`, per the alerts row sub-line. */
export function alertsSubline(favoritesCount: number): string {
  return `keeps your ${favoritesCount} favorite${favoritesCount === 1 ? "" : "s"} on the server to watch menus`;
}
