import type { SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "react-native";

export type PingInsertRow = { sender_id: string; receiver_id: string; hall_tid: number | null; message: string | null };

/**
 * Shared guard for the `pings` insert (issue #146). supabase-js resolves `{ error }` on an
 * RLS/PostgREST failure (not actually friends, network down, expired session, ...) rather than
 * rejecting, so a bare `await supabase.from("pings").insert(...)` silently reports success on
 * failure. Mirrors the check already applied at friend/[id].tsx:131-135 ("review finding #2");
 * SocialPane.tsx and friends.tsx share this exact insert shape, so both go through here instead
 * of duplicating the check. Returns whether the insert actually succeeded, so a caller can skip
 * success-only follow-up (e.g. clearing a typed message).
 */
export async function sendPingGuarded(supabase: Pick<SupabaseClient, "from">, row: PingInsertRow): Promise<boolean> {
  const { error } = await supabase.from("pings").insert(row);
  if (error) {
    Alert.alert("Couldn't send ping", "You may not be friends with this person (yet).");
    return false;
  }
  return true;
}
