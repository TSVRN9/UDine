import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * #236: qr-confirm.tsx's CANCEL button used to run an unconditional delete of the pair's
 * friendships row -- scoped only by user_a/user_b. redeem_qr_token hands back the pair's
 * *existing* row on conflict regardless of its status/origin, so scanning an already-ACCEPTED
 * friend's code (or a pending search-origin request) and hitting CANCEL silently destroyed it --
 * the participants-can-delete RLS policy permits deleting any of the caller's own friendship rows
 * (that's also what account deletion, deleteServerData.ts, needs), so this can't be tightened at
 * the policy layer without breaking that. The fix has to be *what this flow asks to delete*: only
 * the still-unconfirmed row THIS in-person scan created, never anything else.
 *
 * `status = "pending"` protects an already-accepted qr-origin friendship (re-scanning a real
 * friend's code). `origin = "qr"` protects a pending *search*-origin request between the same pair
 * (sent via search, then scanned on top) from being swept up by this in-person cancel. Together
 * they can only ever match the exact row redeem_qr_token would have just created/returned for a
 * genuinely new, unconfirmed in-person add.
 */
export async function cancelQrFriendRequest(supabase: SupabaseClient, myId: string, otherId: string): Promise<{ error: unknown }> {
  const a = myId < otherId ? myId : otherId;
  const b = myId < otherId ? otherId : myId;
  const { error } = await supabase.from("friendships").delete().eq("user_a", a).eq("user_b", b).eq("status", "pending").eq("origin", "qr");
  return { error: error ?? null };
}
