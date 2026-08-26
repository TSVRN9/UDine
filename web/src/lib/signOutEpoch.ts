/**
 * #264 review round 3: notifications/+page.svelte's refresh() self-heals this browser's
 * push_tokens row (re-upserting from a still-live PushSubscription whenever notifications_enabled
 * is true and permission is granted) so the toggle never gets stuck ON with nothing behind it
 * after +layout.svelte's signOut() deletes that row. But the self-heal's own upsert is a real
 * network round trip that can still be in flight when the user clicks "Sign out" -- if it lands
 * AFTER signOut()'s delete, it silently recreates the exact row sign-out just removed,
 * reintroducing #257 under the signing-out user. Reproduced: hold the push_tokens POST upstream,
 * click Sign out mid-flight, and the settle order comes back DELETE-then-UPSERT.
 *
 * Neither a pre-upsert flag check nor a pre-upsert session re-read closes this: the race is the
 * self-heal's own already-in-flight request landing late, which nothing before that request is
 * sent can see coming. This module is checked AFTER the self-heal's upsert resolves instead: if
 * signOut() ran (and bumped this) after the self-heal captured its own start value, the self-heal
 * deletes the row it just wrote right back out -- a compensating action taken once the outcome is
 * known, not a guess about timing beforehand.
 *
 * A plain boolean doesn't work here: it would need resetting once sign-out finishes, and nothing
 * guarantees the self-heal's after-the-fact check runs before that reset happens. A monotonic
 * counter captured at the self-heal's own start and *compared* (not just read) after its upsert
 * survives that reset -- a later, unrelated signOut() call bumping it again still correctly reads
 * as "something changed since I started."
 *
 * Mirrors mobile/src/lib/signOutEpoch.ts -- same race, same fix, separate module per platform
 * since there's no shared runtime between them.
 */
let epoch = 0;

export function bumpSignOutEpoch(): void {
	epoch += 1;
}

export function currentSignOutEpoch(): number {
	return epoch;
}

/**
 * The epoch check above only works if the self-heal's post-upsert continuation actually gets to
 * *run* -- and on web it might not: +layout.svelte's signOut() calls `location.reload()` right
 * after auth.signOut(), which tears down the page's JS realm. A still-in-flight self-heal upsert's
 * `.then()` continuation (the epoch check + compensating delete) never executes if the document
 * that scheduled it is already gone by the time the network response arrives -- confirmed by
 * instrumenting the #264 round-3 repro test: without this, the reload fires immediately, the old
 * page's continuation is silently dropped, and only a *fresh* page's own unrelated self-heal call
 * (with a freshly-reset epoch) ever logs anything.
 *
 * The self-heal registers its own promise here; signOut() awaits it (unbounded -- same as every
 * other network call on this page already is, web has no withTimeout convention) before reloading,
 * so the compensating check above gets a chance to actually finish in the same JS realm that
 * started it. Nothing to await when no self-heal is in flight -- the common case is a no-op.
 */
let pendingSelfHeal: Promise<void> | null = null;

export function registerPendingSelfHeal(promise: Promise<void>): void {
	pendingSelfHeal = promise;
}

export async function awaitPendingSelfHeal(): Promise<void> {
	if (!pendingSelfHeal) return;
	try {
		await pendingSelfHeal;
	} catch {
		// Already logged by the self-heal itself (its own try/catch) -- nothing more to do here.
	}
}
