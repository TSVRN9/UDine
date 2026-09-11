import type { SupabaseClient } from "@supabase/supabase-js";
import { rankDiningHalls } from "./ranking.ts";
import type { Favorite, RankedDish } from "./types.ts";

// Two overlapping syncDiningHallRanks calls (fired fire-and-forget) each running their own
// unserialized delete-then-insert can race: whichever round-trip lands last "wins" the delete, but
// a slower *earlier* call's insert could still land after that, leaving stale ranks on the server.
// Serialized with a module-level promise chain so a call's whole delete+insert always completes
// before the next one starts, regardless of which network round-trip is slower.
// ponytail: one global chain (not per-user) -- fine since a client only ever syncs its own signed-in
// user; per-user chains only worth it if this module ever serves multiple concurrent users.
let syncDiningHallRanksQueue: Promise<void> = Promise.resolve();

/**
 * Pushes the ranked portion of the on-device rankDiningHalls() output to Supabase — the only
 * ranking-derived data allowed to sync, and only for a signed-in user. Delete-then-insert: cheap
 * and correct for a handful of rows. Fire-and-forget from call sites (a failed sync is a
 * re-derivable summary, not data loss), so this never throws/rejects: both network failures and
 * PostgREST-reported errors are caught and logged here, not surfaced to the caller.
 */
export function syncDiningHallRanks(supabase: SupabaseClient, userId: string, rankedDishes: RankedDish[]): Promise<void> {
  const run = () => syncDiningHallRanksNow(supabase, userId, rankedDishes);
  // Chain onto the previous call whether it succeeded or failed, so one failed sync can't wedge
  // every sync after it; the caller still sees their own call's own outcome via `result`.
  const result = syncDiningHallRanksQueue.then(run, run);
  syncDiningHallRanksQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function syncDiningHallRanksNow(supabase: SupabaseClient, userId: string, rankedDishes: RankedDish[]): Promise<void> {
  try {
    const { ranked } = rankDiningHalls(rankedDishes);

    const { error: deleteError } = await supabase.from("favorite_dining_halls").delete().eq("user_id", userId);
    if (deleteError) {
      console.error("syncDiningHallRanks: delete failed", deleteError);
      return;
    }
    if (ranked.length === 0) return;

    const { error: insertError } = await supabase.from("favorite_dining_halls").insert(ranked.map((r) => ({ user_id: userId, hall_tid: r.hallTid, rank: r.rank })));
    if (insertError) {
      console.error("syncDiningHallRanks: insert failed", insertError);
    }
  } catch (err) {
    console.error("syncDiningHallRanks failed", err);
  }
}

/**
 * Pushes dish favorites to favorited_foods for the favorited-food-elsewhere alert Edge Function —
 * only ever called by the app when the user is signed in AND has notifications enabled. Delete-
 * then-insert, same pattern as syncDiningHallRanks.
 *
 * Neither call site wraps this in a try/catch, so — same contract as syncDiningHallRanks — this
 * never throws/rejects. A PostgREST error is returned as `{ error }` instead, so the caller can log
 * it and keep going rather than the rest of the toggle handler silently aborting.
 */
export async function syncFavoritedFoods(supabase: SupabaseClient, userId: string, favorites: Favorite[]) {
  const dishNames = favorites.filter((f): f is Extract<Favorite, { type: "dish" }> => f.type === "dish").map((f) => f.dishName);

  const { error: deleteError } = await supabase.from("favorited_foods").delete().eq("user_id", userId);
  if (deleteError) return { error: deleteError };
  if (dishNames.length === 0) return { error: null };

  const { error: insertError } = await supabase.from("favorited_foods").insert(dishNames.map((dishName) => ({ user_id: userId, dish_name: dishName })));
  return { error: insertError };
}

export type SharedStatField = "completion" | "top_foods" | "hall_ranks";

/**
 * Upserts (or, when `value` is null, clears) exactly one column of the caller's own `shared_stats`
 * row -- the per-stat opt-in/opt-out primitive for sharing hall completion / top foods / hall
 * ranking with friends, each independently. PostgREST's upsert only SETs the columns present in
 * the request body on conflict, so a payload naming just `field` can never clobber the other two
 * stat columns, even on a user's very first opt-in.
 *
 * `value: null` is how a revoke is expressed -- PostgREST writes it as SQL NULL, actually deleting
 * that field's data rather than merely pausing future updates.
 *
 * Same never-throws contract as syncDiningHallRanks/syncFavoritedFoods above: a toggle handler
 * awaits this directly with no try/catch, so a network failure or RLS/PostgREST error resolves as
 * `{ error }` instead of rejecting -- the caller decides whether to roll the toggle back in the UI.
 */
export async function syncSharedStat(supabase: SupabaseClient, userId: string, field: SharedStatField, value: unknown | null): Promise<{ error: unknown }> {
  try {
    const { error } = await supabase.from("shared_stats").upsert({ user_id: userId, [field]: value });
    return { error };
  } catch (err) {
    return { error: err };
  }
}
