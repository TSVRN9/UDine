import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Device-local "sync favorite dining halls to the server" preference (#285). Gates both rank.tsx's
 * `syncDiningHallRanks` call and the Your Data screen's own SYNC-off cascade delete -- unlike the
 * three `shared_stats` fields, favorite_dining_halls has no server column to read this state back
 * from (it's owner-only, never null-as-"off"), so the on/off state itself has to live on-device.
 * AsyncStorage over SQLite, same reasoning as firstRun.ts: one boolean, already a dependency.
 *
 * Defaults to true (a missing key reads as ON): favorite_dining_halls has synced unconditionally on
 * every rank change since #94, so an unset key must not silently start dropping a sync a signed-in
 * user was already relying on for ping suggestions.
 */
const KEY = "udine-hall-sync-enabled";

// Known gap, accepted (not fixed) in #305's review: this preference is mobile-only AsyncStorage --
// web has no equivalent read/write, so web's rank.tsx/halls/[slug]/+page.svelte unconditionally
// re-syncs favorite_dining_halls regardless of what this toggle is set to on mobile. Tracked in
// https://github.com/TSVRN9/UDine/issues/311, not fixed here.
export async function isHallSyncEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY)) !== "false";
}

export async function setHallSyncEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, enabled ? "true" : "false");
}
