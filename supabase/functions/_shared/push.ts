// Shared Web Push / Expo push dispatch, extracted from check-favorited-foods/index.ts (issue #9)
// so send-ping-push (issue #95) can reuse the same senders + dead-token cleanup instead of a second
// copy. Both callers keep their own notification-copy building (buildSightingNotification,
// buildPingNotification) -- this module only knows how to deliver a {title, body} to a user's
// registered push_tokens, not what that title/body should say.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

/** web-push's sendNotification throws a WebPushError with `.statusCode` set to the push service's
 * HTTP response code. 404/410 mean the subscription is permanently gone (unregistered/expired) --
 * anything else (429 rate limit, 5xx) is transient and shouldn't cost the user their subscription. */
export function isPermanentWebPushError(err: unknown): boolean {
  const statusCode = (err as { statusCode?: number } | null)?.statusCode;
  return statusCode === 404 || statusCode === 410;
}

export type ExpoPushReceipt = { status: "ok" | "error"; message?: string; details?: { error?: string } };

/** tokens[i] must be the token that produced receipts[i] (Expo's push API preserves request order
 * in its response). Returns the tokens Expo reports as permanently dead. */
export function findDeadExpoTokens(tokens: string[], receipts: ExpoPushReceipt[]): string[] {
  const dead: string[] = [];
  receipts.forEach((r, i) => {
    if (r.status === "error" && r.details?.error === "DeviceNotRegistered" && tokens[i]) dead.push(tokens[i]);
  });
  return dead;
}

// Known Web Push service hosts (FCM/Chrome, Mozilla autopush, Windows/Edge WNS, Apple web push).
// RLS lets an authenticated user upsert their own push_tokens row with an arbitrary `endpoint`
// (push_tokens has no server-side write path -- see the migration's own comment); without this
// check, dispatchPushNotifications would POST a VAPID-signed request to whatever host they chose --
// a blind, self-triggered SSRF primitive (pr-reviewer finding, #145). Suffix-matched so a real
// service's subdomains (e.g. fcm.googleapis.com) match, but a lookalike host (evilgoogleapis.com)
// does not -- the check requires a "." immediately before the allowlisted suffix, or an exact match.
const PUSH_SERVICE_HOST_SUFFIXES = ["googleapis.com", "mozilla.com", "windows.com", "apple.com"];

export function isKnownPushServiceHost(endpoint: string): boolean {
  let host: string;
  try {
    host = new URL(endpoint).hostname.toLowerCase();
  } catch {
    return false;
  }
  return PUSH_SERVICE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export type PushConfig = {
  webPushConfigured: boolean;
  expoPushConfigured: boolean;
  expoAccessToken: string | undefined;
};

/** Reads the platform push secrets and calls webpush.setVapidDetails() if Web Push is configured.
 * Each platform is gated on its own secrets independently -- one platform's credentials existing
 * doesn't imply the other's do (e.g. VAPID configured but FCM/EAS creds not uploaded yet). */
export function readPushConfig(): PushConfig {
  const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT");
  const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
  const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
  const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN");

  const webPushConfigured = Boolean(VAPID_SUBJECT && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
  const expoPushConfigured = Boolean(expoAccessToken);
  if (webPushConfigured) {
    webpush.setVapidDetails(VAPID_SUBJECT!, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  }
  return { webPushConfigured, expoPushConfigured, expoAccessToken };
}

export type PushNotification = { userId: string; title: string; body: string; data?: Record<string, unknown> };

/** Sends `notifications` to each recipient's registered push_tokens (Web Push + Expo), deleting
 * permanently-dead tokens along the way. Returns counts for the caller's response body. Mirrors the
 * dispatch loop that used to live inline in check-favorited-foods/index.ts's Deno.serve handler. */
export async function dispatchPushNotifications(
  supabase: SupabaseClient,
  notifications: PushNotification[],
  config: PushConfig,
): Promise<{ pushSent: number; tokensRemoved: number }> {
  let pushSent = 0;
  let tokensRemoved = 0;

  if (notifications.length === 0 || (!config.webPushConfigured && !config.expoPushConfigured)) {
    return { pushSent, tokensRemoved };
  }

  const affectedUserIds = [...new Set(notifications.map((n) => n.userId))];
  const { data: tokenRows } = await supabase.from("push_tokens").select("user_id, platform, token").in("user_id", affectedUserIds);

  const tokensByUser = new Map<string, { platform: string; token: string }[]>();
  for (const row of tokenRows ?? []) {
    const list = tokensByUser.get(row.user_id) ?? [];
    list.push({ platform: row.platform, token: row.token });
    tokensByUser.set(row.user_id, list);
  }

  // Expo's push API takes a batch, so mobile notifications are queued here and sent in one POST
  // after the loop; Web Push has no batch endpoint (web-push sends one HTTP request per
  // subscription), so those go out inline.
  const expoMessages: { to: string; title: string; body: string; data?: Record<string, unknown> }[] = [];
  const expoTokensSent: string[] = [];

  for (const n of notifications) {
    for (const t of tokensByUser.get(n.userId) ?? []) {
      if (t.platform === "web" && config.webPushConfigured) {
        let subscription: unknown;
        try {
          subscription = JSON.parse(t.token);
        } catch {
          // Malformed token -- the client only ever writes JSON.stringify(subscription.toJSON()),
          // so this shouldn't happen, but a corrupt/truncated row would otherwise retry forever. It
          // can never succeed, so treat it the same as a permanently-dead subscription.
          await supabase.from("push_tokens").delete().eq("platform", "web").eq("token", t.token);
          tokensRemoved++;
          continue;
        }
        const endpoint = (subscription as { endpoint?: unknown } | null)?.endpoint;
        if (typeof endpoint !== "string" || !isKnownPushServiceHost(endpoint)) {
          // Refuse to send, but don't delete -- unlike a malformed/corrupt token this row parses
          // fine, it's just pointed somewhere we won't POST to. Leaving it means a legitimate future
          // subscription for this user (a different endpoint) still works normally; this row simply
          // never sends.
          console.error("Web push subscription endpoint host not in the known-push-service allowlist, refusing to send:", endpoint);
          continue;
        }
        try {
          await webpush.sendNotification(subscription, JSON.stringify({ title: n.title, body: n.body }));
          pushSent++;
        } catch (err) {
          if (isPermanentWebPushError(err)) {
            await supabase.from("push_tokens").delete().eq("platform", "web").eq("token", t.token);
            tokensRemoved++;
          } else {
            console.error("Web push send failed (transient, keeping token):", err);
          }
        }
      } else if (t.platform === "expo" && config.expoPushConfigured) {
        expoMessages.push({ to: t.token, title: n.title, body: n.body, data: n.data });
        expoTokensSent.push(t.token);
      }
    }
  }

  // ponytail: only catches DeviceNotRegistered when it comes back on this initial ticket response.
  // Expo often reports it asynchronously instead, via the separate receipts endpoint
  // (getPushNotificationReceipts, polled ~15min later) -- those never get cleaned up here. Add a
  // receipts-polling step (or a second scheduled function) if dead Expo tokens are observed piling
  // up in push_tokens.
  if (expoMessages.length > 0) {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.expoAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(expoMessages),
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: ExpoPushReceipt[] };
      const receipts = json.data ?? [];
      pushSent += receipts.filter((r) => r.status === "ok").length;
      for (const token of findDeadExpoTokens(expoTokensSent, receipts)) {
        await supabase.from("push_tokens").delete().eq("platform", "expo").eq("token", token);
        tokensRemoved++;
      }
    } else {
      console.error("Expo push batch send failed:", res.status, await res.text());
    }
  }

  return { pushSent, tokensRemoved };
}
