// Pushes a notification to a ping's receiver, triggered per-insert by a pg_net trigger/webhook on
// public.pings (see supabase/migrations/*_ping_push_trigger.sql) rather than the hourly
// check-favorited-foods cron -- pings are latency-sensitive, a ping from 40 minutes ago is useless.
//
// Copy (issue #95, canvas -- PushAlerts.dc.html mockup): title `<sender>: "<message> <hall>"`, body
// `<hall> is open until <time>` (omitted, not guessed, if the hall isn't open right now or hours
// data doesn't cover it). Deliberately does NOT gate on profiles.notifications_enabled -- that flag
// is scoped to favorited-food alerts in CLAUDE.md's data-residency table; a ping is a direct friend
// interaction, not a food-alert preference. The payload carries only the sender's display name, the
// ping message, and the hall -- no food history leaves the device (consistent with the residency
// table: pings are server-side by definition, food logs never are).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { hallName, fetchHallHours, currentlyOpenUntil } from "../_shared/hours.ts";
import { dispatchPushNotifications, readPushConfig } from "../_shared/push.ts";

const TRAILING_ELLIPSIS = /(…|\.\.\.)\s*$/;
const MAX_MESSAGE_LENGTH = 100;

/**
 * `message` is nullable client-written text (pings.message) -- trimmed, its trailing "…"/"..." cut
 * (PING_MESSAGES in mobile/src/lib/pingGesture.ts all end in one, meant to trail into the hall name
 * inline in the bubble UI; kept literally in a push title it would read as a stray double
 * punctuation mark), and capped well under Expo's per-message size limits. A blank/null message
 * falls back to just the hall name rather than empty quotes.
 */
export function buildPingNotification(
  senderName: string,
  message: string | null | undefined,
  hallTid: number,
  closesAtLabel: string | null,
): { title: string; body: string } {
  const hall = hallName(hallTid);
  const cleanMessage = (message ?? "").trim().replace(TRAILING_ELLIPSIS, "").trim().slice(0, MAX_MESSAGE_LENGTH);
  const title = cleanMessage ? `${senderName}: "${cleanMessage} ${hall}"` : `${senderName}: ${hall}`;
  const body = closesAtLabel ? `${hall} is open until ${closesAtLabel}.` : "";
  return { title, body };
}

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let pingId: string | undefined;
  try {
    ({ ping_id: pingId } = (await req.json()) as { ping_id?: string });
  } catch {
    // malformed body -- fall through to the missing-ping_id 400 below
  }
  if (!pingId) {
    return new Response(JSON.stringify({ error: "missing ping_id" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const { data: ping, error: pingError } = await supabase
    .from("pings")
    .select("sender_id, receiver_id, hall_tid, message")
    .eq("id", pingId)
    .maybeSingle();
  if (pingError) {
    return new Response(JSON.stringify({ error: pingError.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  if (!ping || ping.hall_tid === null) {
    // A ping with no hall (or a ping_id that no longer exists) has nothing actionable to push --
    // not an error, just nothing to do.
    return new Response(JSON.stringify({ sent: false, reason: "no ping or no hall_tid" }), { headers: { "Content-Type": "application/json" } });
  }

  const { data: senderProfile } = await supabase.from("profiles").select("display_name").eq("user_id", ping.sender_id).maybeSingle();
  const senderName = senderProfile?.display_name ?? "A friend";

  const hallHours = await fetchHallHours();
  const hours = hallHours.get(ping.hall_tid);
  const closesAtLabel = hours ? currentlyOpenUntil(hours) : null;

  const { title, body } = buildPingNotification(senderName, ping.message, ping.hall_tid, closesAtLabel);

  const pushConfig = readPushConfig();
  const { pushSent, tokensRemoved } = await dispatchPushNotifications(
    supabase,
    [{ userId: ping.receiver_id, title, body, data: { pingId, hallTid: ping.hall_tid } }],
    pushConfig,
  );

  return new Response(
    JSON.stringify({ sent: true, pushConfigured: pushConfig.webPushConfigured || pushConfig.expoPushConfigured, pushSent, tokensRemoved }),
    { headers: { "Content-Type": "application/json" } },
  );
});
