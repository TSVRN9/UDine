// Matches signed-in, notifications-enabled users' favorited_foods against today's live UMass Dining
// menu, records a food_sightings row for each match ("your favorited dish is at Hampshire today"),
// and pushes a notification per new sighting to that user's registered push_tokens (Web Push via
// VAPID, Expo push via the Expo push API). Push dispatch is gated per-platform on its own secrets
// (see readPushConfig() in _shared/push.ts) — matching/upsert always runs regardless.
//
// Intended to run on a schedule (Supabase Cron / pg_cron -> net.http_post), not from client code —
// nothing in the client apps should call this directly.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { HALL_TIDS, hallName, fetchHallHours, windowCloseLabel, type HallHours, type TimeWindow } from "../_shared/hours.ts";
import { dispatchPushNotifications, readPushConfig, isPermanentWebPushError, findDeadExpoTokens } from "../_shared/push.ts";

export { isPermanentWebPushError, findDeadExpoTokens };

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
 * Pulls dish name -> meal period ("breakfast"/"lunch"/"dinner", whatever key foodpro-menu-ajax used)
 * out of one hall's raw response. A dish keeps the FIRST meal period it's found under (object key
 * order from the live API is already breakfast/lunch/dinner) -- issue #95's sighting copy only needs
 * one meal period to lead with, not every slot a dish repeats across.
 *
 * Name-only extraction, deliberately not the full nutrition parser in shared/src/umassDining.ts —
 * this function only needs to know which dish names are being served today (and under which meal),
 * not their macros, and @udine/shared (a local workspace package) isn't published anywhere Deno's
 * `npm:`/`jsr:` resolvers could import it from.
 *
 * ponytail: accepted duplication, not a shared module — this and parseCategoryItems() in
 * shared/src/umassDining.ts independently parse the same UMass Dining HTML. If a markup change
 * breaks dish-name extraction, check both; upgrade path is publishing @udine/shared to JSR (or
 * vendoring this function via a build step) if drift ever actually bites.
 */
export function extractDishMealMap(data: Partial<Record<string, Record<string, string> | undefined>>): Map<string, string> {
  const dishMeal = new Map<string, string>();
  for (const [mealPeriod, categories] of Object.entries(data)) {
    if (!categories) continue;
    for (const html of Object.values(categories)) {
      for (const m of html.matchAll(/data-dish-name="([^"]*)"/g)) {
        // .trim() matches shared/src/umassDining.ts's getAttrRaw (decode then trim) -- favorites are
        // stored trimmed (that's what the shared parser writes), so an untrimmed key here would
        // silently fail to match any dish whose live attribute has surrounding whitespace: no
        // sighting, no push, no error either. pr-reviewer finding (#145): not reachable on a live
        // probe (2026-08-23: 174 tags, 0 padded), but a latent parity trap between the two parsers.
        const name = decodeEntities(m[1]).trim();
        if (!dishMeal.has(name)) dishMeal.set(name, mealPeriod);
      }
    }
  }
  return dishMeal;
}

/**
 * Fetches + extracts one hall's dish->meal map, degrading to an empty map -- not throwing -- on ANY
 * failure: a rejected fetch (DNS/TLS/connection), a non-OK response, or a 200 whose body isn't valid
 * JSON (a maintenance page, a realistic failure mode for umassdining.com's scraped Drupal endpoint).
 * Mirrors _shared/hours.ts's fetchHallHours (same hazard, same fix, see its doc comment for the full
 * reasoning) -- pr-reviewer finding (#145): this fetch was unguarded, so a single hall's rejection or
 * maintenance page threw out of the Deno.serve handler and aborted the WHOLE invocation (zero
 * sightings/pushes for every hall and every user), while pg_cron still reported success.
 *
 * `fetchImpl` defaults to the global fetch; tests inject a stub so both failure paths are
 * red-green-testable without a real network call.
 */
export async function fetchHallMenu(hallTid: number, fetchImpl: typeof fetch = fetch): Promise<Map<string, string>> {
  const url = `https://www.umassdining.com/foodpro-menu-ajax?tid=${hallTid}&date=${encodeURIComponent(todayDateParam())}`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return new Map();
    const data = (await res.json()) as Partial<Record<string, Record<string, string>>>;
    return extractDishMealMap(data);
  } catch (err) {
    console.error(`fetchHallMenu(${hallTid}) failed, degrading to no dishes for this hall:`, err);
    return new Map();
  }
}

const MEAL_LABELS: Record<string, string> = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner", latenight: "late night" };

/** get_infov2 has no latenight fields at all (see _shared/hours.ts's own doc comment), so only
 * breakfast/lunch/dinner ever resolve to a real window here. */
function mealWindow(hours: HallHours | undefined, mealPeriod: string): TimeWindow | null {
  if (!hours) return null;
  if (mealPeriod === "breakfast") return hours.breakfast;
  if (mealPeriod === "lunch") return hours.lunch;
  if (mealPeriod === "dinner") return hours.dinner;
  return null;
}

/** v2 copy (issue #95, canvas): title `<dish> is at <hall> today`; body leads with the meal period
 * the dish was listed under today, then the until-when (that meal's close time) -- the actionable
 * part. Omits the until-when clause rather than guessing when hours data doesn't cover this hall/meal
 * (e.g. hall not matched in get_infov2, or a meal with no published per-meal breakdown). */
export function buildSightingNotification(dishName: string, hallTid: number, mealPeriod: string, hours?: HallHours): { title: string; body: string } {
  const hall = hallName(hallTid);
  const mealLabel = MEAL_LABELS[mealPeriod] ?? mealPeriod;
  const closeLabel = windowCloseLabel(mealWindow(hours, mealPeriod));
  const body = closeLabel
    ? `A favorite of yours is on the ${mealLabel} menu — served until ${closeLabel}.`
    : `A favorite of yours is on the ${mealLabel} menu today.`;
  return { title: `${dishName} is at ${hall} today`, body };
}

Deno.serve(async (_req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const isoDate = todayIsoDate();

  const hallDishes = new Map<number, Map<string, string>>();
  for (const tid of HALL_TIDS) {
    hallDishes.set(tid, await fetchHallMenu(tid));
  }
  const hallHours = await fetchHallHours();

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

  const newSightingsList: { userId: string; dishName: string; hallTid: number; mealPeriod: string }[] = [];
  for (const fav of favorites ?? []) {
    for (const [hallTid, dishes] of hallDishes) {
      const mealPeriod = dishes.get(fav.dish_name);
      if (mealPeriod === undefined) continue;

      const { error: upsertError, data: upserted } = await supabase
        .from("food_sightings")
        .upsert({ user_id: fav.user_id, dish_name: fav.dish_name, hall_tid: hallTid, sighted_date: isoDate }, { onConflict: "user_id,dish_name,hall_tid,sighted_date", ignoreDuplicates: true })
        .select("id");

      if (!upsertError && (upserted?.length ?? 0) > 0) newSightingsList.push({ userId: fav.user_id, dishName: fav.dish_name, hallTid, mealPeriod });
    }
  }

  const pushConfig = readPushConfig();
  const pushConfigured = pushConfig.webPushConfigured || pushConfig.expoPushConfigured;
  if (!pushConfigured) {
    console.log("Push dispatch skipped: no Expo/VAPID push credentials configured.");
  }

  const notifications = newSightingsList.map((s) => ({
    userId: s.userId,
    ...buildSightingNotification(s.dishName, s.hallTid, s.mealPeriod, hallHours.get(s.hallTid)),
    data: { dishName: s.dishName, hallTid: s.hallTid },
  }));
  const { pushSent, tokensRemoved } = await dispatchPushNotifications(supabase, notifications, pushConfig);

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
