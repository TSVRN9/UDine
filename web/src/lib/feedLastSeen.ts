// Device-local "last viewed the activity feed" marker. `pings` has no `read_at` column (see
// CLAUDE.md's residency table and issue #66 — no schema changes), so ping unread state is derived
// from this instead of a server flag. It's UI state, not health/food data, so localStorage is fine
// per the residency doc. Same shape as preferences.ts.
//
// Keyed per user id (not a single global key) so a second account signing in on the same browser
// doesn't inherit the first account's watermark and silently mark its own unread pings as seen.
const KEY_PREFIX = "udine-feed-last-seen";

export function loadFeedLastSeen(userId: string): string {
	return localStorage.getItem(`${KEY_PREFIX}:${userId}`) ?? new Date(0).toISOString();
}

export function saveFeedLastSeen(userId: string, iso: string): void {
	localStorage.setItem(`${KEY_PREFIX}:${userId}`, iso);
}
