import type { SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "react-native";

export type PingInsertRow = { sender_id: string; receiver_id: string; hall_tid: number | null; message: string | null };

/**
 * Shared guard for the `pings` insert (issue #146). supabase-js resolves `{ error }` on an
 * RLS/PostgREST failure (not actually friends, network down, expired session, ...) rather than
 * rejecting, so a bare `await supabase.from("pings").insert(...)` silently reports success on
 * failure. Mirrors the check already applied at friend/[id].tsx:151-164 ("review finding #2").
 * No longer used by SocialPane.tsx (#181) or friends.tsx (#231) -- both now route through
 * pingQueue.ts's sendOrQueuePing instead, which additionally queues a transient failure for retry
 * rather than just alerting on it. friend/[id].tsx's own inline insert (linked above) still has
 * this same undifferentiated-alert behavior and hasn't been routed through either fix -- a sibling
 * gap, not yet filed.
 */
export async function sendPingGuarded(supabase: Pick<SupabaseClient, "from">, row: PingInsertRow): Promise<boolean> {
  const { error } = await supabase.from("pings").insert(row);
  if (error) {
    Alert.alert("Couldn't send ping", "You may not be friends with this person (yet).");
    return false;
  }
  return true;
}
