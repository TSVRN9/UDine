// PR #286 review (Blocking 2, round 2): mirrors mobile's favoritesSyncMarker.ts (AsyncStorage there,
// localStorage here -- same reasoning applies verbatim, see that file's own doc comment). Whether
// this browser has ever actually synced this account's favorites via toggleNotifications(true) can't
// be derived from notifications_enabled or Notification.permission alone: notifications_enabled
// defaulting true (#248) plus permission already granted (a second account signing in on a browser
// that already granted this site notification permission) means refresh()'s self-heal re-registers a
// push subscription without toggleNotifications() ever running -- and syncFavoritedFoods only ever
// runs from there, deliberately never from refresh() (delete-then-insert, shared/src/sync.ts --
// running it on every load would wipe a fresh browser's still-empty favorited_foods against whatever
// a REAL other device already synced).
//
// Keyed per user id, same reasoning as feedLastSeen.ts.
const KEY_PREFIX = "udine-favorites-synced";

export function hasSyncedFavorites(userId: string): boolean {
	return localStorage.getItem(`${KEY_PREFIX}:${userId}`) === "true";
}

/** Only call after syncFavoritedFoods actually succeeds -- a failed sync must not be mistaken for a
 * done one. */
export function markFavoritesSynced(userId: string): void {
	localStorage.setItem(`${KEY_PREFIX}:${userId}`, "true");
}
