/**
 * #264 review round 4: notifications/+page.svelte's self-heal (refresh() re-upserting from a
 * still-live PushSubscription) can still be mid-flight when the user clicks "Sign out". Two
 * earlier attempts at this (a pre-upsert flag, then a post-upsert "compensating delete" epoch
 * counter) both failed: the epoch approach's compensating delete fired *after* auth.signOut() had
 * already cleared the session, so it 403'd (push_tokens has no anon grant) and the resurrected row
 * stayed -- reviewer-reproduced, not theoretical.
 *
 * The fix that actually closes it is ordering, not detection: +layout.svelte's signOut() awaits
 * whatever self-heal is registered here -- bounded (Promise.race with a timer; no shared web
 * withTimeout convention exists), so a hung fetch can't hang sign-out -- BEFORE its own delete, and
 * BEFORE calling auth.signOut(). Either the self-heal finishes (and signOut()'s own delete removes
 * whatever it wrote, with a still-live session) or it never started. No epoch, no compensating
 * write, nothing to race.
 *
 * Mirrors mobile/src/lib/pendingSelfHeal.ts -- same fix, separate module per platform since
 * there's no shared runtime between them.
 */
let pending: Promise<void> | null = null;

export function registerPendingSelfHeal(promise: Promise<void>): void {
	pending = promise;
}

export function pendingSelfHeal(): Promise<void> | null {
	return pending;
}
