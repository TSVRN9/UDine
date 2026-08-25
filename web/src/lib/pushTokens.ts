import type { SupabaseClient } from "@supabase/supabase-js";

// Extracted from notifications/+page.svelte (#257) so +layout.svelte's signOut() can reuse the
// exact same "find this browser's own push subscription, delete only that row" logic instead of
// re-deriving it -- see that page's enablePush/disablePush/refresh for the fuller push-registration
// flow this is a slice of.

/** This browser's own live PushSubscription, serialized the same way notifications/+page.svelte's
 * enablePush() stores it -- used to scope a push_tokens delete to only this browser's row instead
 * of every row for the user (#185). Reads an existing subscription only; never creates one, so
 * it's safe to call from a path (like sign-out) that has no business prompting for permission or
 * registering a service worker. */
export async function ownPushToken(): Promise<string | undefined> {
	if (!("serviceWorker" in navigator) || !("PushManager" in window)) return undefined;
	const registration = await navigator.serviceWorker.getRegistration();
	const subscription = await registration?.pushManager.getSubscription();
	return subscription ? JSON.stringify(subscription.toJSON()) : undefined;
}

/** Deletes this device's push_tokens row(s) for `userId`.
 *
 * #185: passing no `ownToken` wipes EVERY browser's token for this user, not just the caller's --
 * only safe when the caller genuinely wants every row gone (nothing currently does; disablePush()
 * intentionally still does this, since notifications_enabled flips off account-wide alongside it,
 * making any other device's stale token inert). Callers scoping to one device (sign-out, the
 * permission-revoked cleanup) must pass the token from ownPushToken() and skip the call entirely
 * when that's undefined -- there's no live subscription to identify "this device's row" by, and
 * guessing would risk the same blanket delete #185 fixed. */
export async function clearStoredPushTokens(supabase: SupabaseClient, userId: string, ownToken?: string) {
	let query = supabase.from("push_tokens").delete().eq("user_id", userId).eq("platform", "web");
	if (ownToken) query = query.eq("token", ownToken);
	await query;
}
