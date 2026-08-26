import AsyncStorage from "@react-native-async-storage/async-storage";

// PR #286 review (Blocking 2, round 2): notifications_enabled defaulting true (#248) plus OS
// permission already granted -- a second account signing in on a phone that already granted this
// app notification permission (#263's exact scenario), or Android <=12 (which never asks) -- means
// useFavoriteFoodAlerts's refresh() self-heal can register a push token and render ON without
// toggle() ever running. syncFavoritedFoods only ever runs from toggle() -- deliberately never from
// refresh(), since it's delete-then-insert (shared/src/sync.ts) and running it on every focus would
// wipe a fresh device's still-empty favorited_foods against whatever a REAL other device already
// synced. So "has this device ever actually synced this account's favorites" can't be derived from
// notifications_enabled or OS permission alone -- it needs its own persisted signal. Keyed per
// user_id, same reasoning (and same pattern) as sharedStatsSeed.ts.
const KEY_PREFIX = "udine-favorites-synced:";

/** Has toggle(true) ever successfully synced this account's favorites from this device? */
export async function hasSyncedFavorites(userId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY_PREFIX + userId)) === "true";
}

/** Marks favorites as synced for this account -- only call after syncFavoritedFoods actually
 * succeeds (see favoriteFoodAlerts.ts's toggle()); a failed sync must not be mistaken for a done one. */
export async function markFavoritesSynced(userId: string): Promise<void> {
  await AsyncStorage.setItem(KEY_PREFIX + userId, "true");
}
