// Matches signed-in, notifications-enabled users' favorited_foods against today's live UMass Dining
// menu, records a food_sightings row for each match ("your favorited dish is at Hampshire today"),
// and pushes a notification per new sighting to that user's registered push_tokens (Web Push via
// VAPID, Expo push via the Expo push API). Push dispatch is gated per-platform on its own secrets
// (see webPushConfigured/expoPushConfigured below) — matching/upsert always runs regardless.
//
// Intended to run on a schedule (Supabase Cron / pg_cron -> net.http_post), not from client code —
// nothing in the client apps should call this directly.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const HALL_TIDS = [1, 2, 3, 4]; // Worcester, Franklin, Hampshire, Berkshire — see docs/apk-reverse-engineering.md

// ponytail: duplicated from shared/src/umassDining.ts's DINING_HALLS (name-only, not the full
// DiningHall shape) — same reason as the dish-name parser above: @udine/shared isn't importable
// from Deno's npm:/jsr: resolvers. Upgrade path is the same one noted there.
const HALL_NAMES: Record<number, string> = { 1: "Worcester", 2: "Franklin", 3: "Hampshire", 4: "Berkshire" };

// UMass Dining's calendar day and dining hours run on US/Eastern, not the Edge runtime's clock
// (UTC on Deno Deploy) — deriving "today" from Intl instead of local getters/toISOString keeps
// runs between ~8pm-midnight Eastern from fetching/recording the next UTC day by mistake.
function easternDateParts(): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function todayDateParam(): string {
  const { year, month, day } = easternDateParts();
  return `${month}/${day}/${year}`;
}

export function todayIsoDate(): string {
  const { year, month, day } = easternDateParts();
  return `${year}-${month}-${day}`;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&#039;": "'", "&quot;": '"', "&lt;": "<", "&gt;": ">" };
function decodeEntities(s: string): string {
  return s.replace(/&(amp|#039|quot|lt|gt);/g, (m) => ENTITIES[m] ?? m);
}

/**
 * Name-only extraction, deliberately not the full nutrition parser in shared/src/umassDining.ts —
 * this function only needs to know which dish names are being served today, not their macros, and
 * @udine/shared (a local workspace package) isn't published anywhere Deno's `npm:`/`jsr:` resolvers
 * could import it from.
 *
 * ponytail: accepted duplication, not a shared module — this and parseCategoryItems() in
 * shared/src/umassDining.ts independently parse the same UMass Dining HTML. If a markup change
 * breaks dish-name extraction, check both; upgrade path is publishing @udine/shared to JSR (or
 * vendoring this function via a build step) if drift ever actually bites.
 */
async function fetchDishNamesForHall(hallTid: number): Promise<Set<string>> {
  const url = `https://www.umassdining.com/foodpro-menu-ajax?tid=${hallTid}&date=${encodeURIComponent(todayDateParam())}`;
  const res = await fetch(url);
  if (!res.ok) return new Set();
  const data = (await res.json()) as Partial<Record<string, Record<string, string>>>;
  const names = new Set<string>();
  for (const categories of Object.values(data)) {
    if (!categories) continue;
    for (const html of Object.values(categories)) {
      for (const m of html.matchAll(/data-dish-name="([^"]*)"/g)) {
        names.add(decodeEntities(m[1]));
      }
    }
  }
  return names;
}

export function buildSightingNotification(dishName: string, hallTid: number): { title: string; body: string } {
  const hall = HALL_NAMES[hallTid] ?? `hall ${hallTid}`;
  return { title: `Spotted: ${dishName}`, body: `at ${hall} today` };
}

/** web-push's sendNotification throws a WebPushError with `.statusCode` set to the push service's
 * HTTP response code. 404/410 mean the subscription is permanently gone (unregistered/expired) —
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

Deno.serve(async (_req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const isoDate = todayIsoDate();

  const hallDishes = new Map<number, Set<string>>();
  for (const tid of HALL_TIDS) {
    hallDishes.set(tid, await fetchDishNamesForHall(tid));
  }

  // Two plain queries rather than an embedded join: favorited_foods and profiles both reference
  // auth.users independently, with no direct FK between the two, so PostgREST can't resolve
  // `profiles!inner(...)` as an embedded resource here.
  const { data: enabledProfiles, error: profilesError } = await supabase.from("profiles").select("user_id").eq("notifications_enabled", true);
  if (profilesError) {
    return new Response(JSON.stringify({ error: profilesError.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const userIds = (enabledProfiles ?? []).map((p) => p.user_id);
  const favorites = userIds.length === 0 ? [] : (await supabase.from("favorited_foods").select("user_id, dish_name").in("user_id", userIds)).data;
  if (favorites === null) {
    return new Response(JSON.stringify({ error: "failed to load favorited_foods" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const newSightingsList: { userId: string; dishName: string; hallTid: number }[] = [];
  for (const fav of favorites ?? []) {
    for (const [hallTid, dishes] of hallDishes) {
      if (!dishes.has(fav.dish_name)) continue;

      const { error: upsertError, data: upserted } = await supabase
        .from("food_sightings")
        .upsert({ user_id: fav.user_id, dish_name: fav.dish_name, hall_tid: hallTid, sighted_date: isoDate }, { onConflict: "user_id,dish_name,hall_tid,sighted_date", ignoreDuplicates: true })
        .select("id");

      if (!upsertError && (upserted?.length ?? 0) > 0) newSightingsList.push({ userId: fav.user_id, dishName: fav.dish_name, hallTid });
    }
  }

  const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT");
  const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
  const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
  const EXPO_ACCESS_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN");

  // Each platform is gated on its own secrets — one platform's credentials existing doesn't imply
  // the other's do (e.g. VAPID configured but FCM/EAS creds not uploaded yet, or vice versa).
  const webPushConfigured = Boolean(VAPID_SUBJECT && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
  const expoPushConfigured = Boolean(EXPO_ACCESS_TOKEN);
  const pushConfigured = webPushConfigured || expoPushConfigured;
  if (!pushConfigured) {
    console.log("Push dispatch skipped: no Expo/VAPID push credentials configured.");
  }
  if (webPushConfigured) {
    webpush.setVapidDetails(VAPID_SUBJECT!, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  }

  let pushSent = 0;
  let tokensRemoved = 0;

  if (newSightingsList.length > 0 && pushConfigured) {
    const affectedUserIds = [...new Set(newSightingsList.map((s) => s.userId))];
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
    const expoMessages: { to: string; title: string; body: string; data: { dishName: string; hallTid: number } }[] = [];
    const expoTokensSent: string[] = [];

    for (const sighting of newSightingsList) {
      const { title, body } = buildSightingNotification(sighting.dishName, sighting.hallTid);
      for (const t of tokensByUser.get(sighting.userId) ?? []) {
        if (t.platform === "web" && webPushConfigured) {
          let subscription: unknown;
          try {
            subscription = JSON.parse(t.token);
          } catch {
            // Malformed token — the client only ever writes JSON.stringify(subscription.toJSON()),
            // so this shouldn't happen, but a corrupt/truncated row would otherwise retry forever.
            // It can never succeed, so treat it the same as a permanently-dead subscription.
            await supabase.from("push_tokens").delete().eq("platform", "web").eq("token", t.token);
            tokensRemoved++;
            continue;
          }
          try {
            await webpush.sendNotification(subscription, JSON.stringify({ title, body }));
            pushSent++;
          } catch (err) {
            if (isPermanentWebPushError(err)) {
              await supabase.from("push_tokens").delete().eq("platform", "web").eq("token", t.token);
              tokensRemoved++;
            } else {
              console.error("Web push send failed (transient, keeping token):", err);
            }
          }
        } else if (t.platform === "expo" && expoPushConfigured) {
          expoMessages.push({ to: t.token, title, body, data: { dishName: sighting.dishName, hallTid: sighting.hallTid } });
          expoTokensSent.push(t.token);
        }
      }
    }

    // ponytail: only catches DeviceNotRegistered when it comes back on this initial ticket
    // response. Expo often reports it asynchronously instead, via the separate receipts endpoint
    // (getPushNotificationReceipts, polled ~15min later) — those never get cleaned up here. Add a
    // receipts-polling step (or a second scheduled function) if dead Expo tokens are observed
    // piling up in push_tokens.
    if (expoMessages.length > 0) {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}`, "Content-Type": "application/json" },
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
  }

  return new Response(
    JSON.stringify({
      checkedHalls: HALL_TIDS.length,
      favoritesChecked: favorites?.length ?? 0,
      newSightings: newSightingsList.length,
      pushConfigured,
      pushSent,
      tokensRemoved,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
