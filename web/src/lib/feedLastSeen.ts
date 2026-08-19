// Device-local "last viewed the activity feed" marker. `pings` has no `read_at` column (see
// CLAUDE.md's residency table and issue #66 — no schema changes), so ping unread state is derived
// from this instead of a server flag. It's UI state, not health/food data, so localStorage is fine
// per the residency doc. Same shape as preferences.ts.
const KEY = "udine-feed-last-seen";

export function loadFeedLastSeen(): string {
	return localStorage.getItem(KEY) ?? new Date(0).toISOString();
}

export function saveFeedLastSeen(iso: string): void {
	localStorage.setItem(KEY, iso);
}
