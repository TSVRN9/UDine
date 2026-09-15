import { DINING_HALLS, GRAB_N_GO_TIDS } from "@udine/shared";

import { todayIso } from "./date";
import { countsByHallToday } from "./sightingDedup";
import { supabase } from "./supabase";

/**
 * Resolves a Grab 'N Go tid back to its parent hall's tid -- same `GRAB_N_GO_TIDS` lookup shape as
 * umassDining.ts's own (unexported) `resolveHallName`, just returning the parent hall's tid instead
 * of its display name. A tid that's already a DINING_HALLS tid resolves to itself; anything else
 * (a retail/café tid) resolves to null so the caller can drop it -- this badge is halls + their
 * Grab 'N Go strip only (see the brief's Rationale), never Cafés & Markets.
 */
function parentHallTid(tid: number): number | null {
  if (DINING_HALLS.some((hall) => hall.tid === tid)) return tid;
  const gngSlug = Object.entries(GRAB_N_GO_TIDS).find(([, gngTid]) => gngTid === tid)?.[0];
  const hall = gngSlug ? DINING_HALLS.find((h) => h.slug === gngSlug) : undefined;
  return hall?.tid ?? null;
}

/** Rolls a raw tid->count map (may contain Grab 'N Go and unrelated tids) into DINING_HALLS tids only. */
function rollUpToHalls(raw: Map<number, number>): Map<number, number> {
  const result = new Map<number, number>();
  for (const [tid, count] of raw) {
    const hallTid = parentHallTid(tid);
    if (hallTid === null) continue;
    result.set(hallTid, (result.get(hallTid) ?? 0) + count);
  }
  return result;
}

/**
 * Today's per-hall favorited-food spotted count (Main.dc.html's status badge, task 2). Same
 * signed-in check as backgroundTask.ts's notifySignedOutFavoriteMatches -- supabase.auth.getSession(),
 * not a new auth helper. Signed-in reads the server's `food_sightings` (RLS already scopes to the
 * caller, `.eq("user_id", ...)` here is defense in depth matching web's notifications page); signed-
 * out reads the local dedup store. Both roll Grab 'N Go tids into their parent hall before returning,
 * so callers only ever see DINING_HALLS tids.
 *
 * Wrapped in try/catch -- this feeds a glanceable badge, not a screen a failure should block; a
 * network/db hiccup degrades to "no badges" (empty map) the same way a hall with zero matches does,
 * never an error state (matches the brief's acceptance criteria).
 */
export async function hallSpottedCounts(): Promise<Map<number, number>> {
  try {
    const date = todayIso();
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      return rollUpToHalls(await countsByHallToday(date));
    }

    const { data: rows } = await supabase.from("food_sightings").select("hall_tid").eq("user_id", data.session.user.id).eq("sighted_date", date);
    const raw = new Map<number, number>();
    for (const row of (rows ?? []) as { hall_tid: number }[]) {
      raw.set(row.hall_tid, (raw.get(row.hall_tid) ?? 0) + 1);
    }
    return rollUpToHalls(raw);
  } catch (e) {
    console.warn("[hallSpottedCounts] failed, showing no badges", e);
    return new Map();
  }
}
