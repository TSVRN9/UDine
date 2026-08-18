// Matches signed-in, notifications-enabled users' favorited_foods against today's live UMass Dining
// menu, and records a food_sightings row for each match ("your favorited dish is at Hampshire today").
//
// Push delivery to push_tokens is deliberately NOT implemented yet — it needs a VAPID keypair (Web
// Push) and Firebase/FCM config (Expo push on Android) that the user hasn't supplied. The matching
// logic below is the verifiable half of this feature; see CLAUDE.md for status. Once credentials
// exist, extend the loop below to send a push per new sighting using push_tokens for that user.
//
// Intended to run on a schedule (Supabase Cron / pg_cron -> net.http_post), not from client code —
// nothing in the client apps should call this directly.
import { createClient } from "jsr:@supabase/supabase-js@2";

const HALL_TIDS = [1, 2, 3, 4]; // Worcester, Franklin, Hampshire, Berkshire — see docs/apk-reverse-engineering.md

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

  let newSightings = 0;
  for (const fav of favorites ?? []) {
    for (const [hallTid, dishes] of hallDishes) {
      if (!dishes.has(fav.dish_name)) continue;

      const { error: upsertError, data: upserted } = await supabase
        .from("food_sightings")
        .upsert({ user_id: fav.user_id, dish_name: fav.dish_name, hall_tid: hallTid, sighted_date: isoDate }, { onConflict: "user_id,dish_name,hall_tid,sighted_date", ignoreDuplicates: true })
        .select("id");

      if (!upsertError && (upserted?.length ?? 0) > 0) newSightings++;
    }
  }

  const pushConfigured = Boolean(Deno.env.get("EXPO_ACCESS_TOKEN") || Deno.env.get("VAPID_PRIVATE_KEY"));
  if (!pushConfigured) {
    console.log("Push dispatch skipped: no Expo/VAPID push credentials configured.");
  }

  return new Response(JSON.stringify({ checkedHalls: HALL_TIDS.length, favoritesChecked: favorites?.length ?? 0, newSightings, pushConfigured }), {
    headers: { "Content-Type": "application/json" },
  });
});
