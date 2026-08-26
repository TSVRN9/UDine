export type FriendshipOrigin = "search" | "qr";

/** #256: a qr-origin pending row can only ever leave "pending" via both sides confirming in
 * person (`confirm_friendship`) -- the friendships_qr_needs_both_confirms CHECK constraint
 * (supabase/migrations/20260824150000_add_friends_discoverability_and_qr.sql:147-148) means a raw
 * `update({status: "accepted"})` on such a row always violates it, regardless of which side issues
 * the update. Mirrors mobile's `origin === "qr"` gate (mobile/src/app/friends.tsx, #252) -- web has
 * no /qr-confirm route to send the user to instead (grepped: nothing under web/src references
 * confirm_friendship/qr_tokens/redeem_qr), so the fix here is to never offer the doomed action
 * rather than build a second confirm flow. */
export function canAcceptDirectly(origin: FriendshipOrigin): boolean {
	return origin !== "qr";
}
