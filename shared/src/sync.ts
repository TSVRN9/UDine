import type { SupabaseClient } from "@supabase/supabase-js";
import { rankDiningHalls } from "./ranking.ts";
import type { Favorite, RankedDish } from "./types.ts";

/**
 * Pushes the ranked portion of the on-device rankDiningHalls() output to Supabase — the only
 * ranking-derived data allowed to sync, and only for a signed-in user. Delete-then-insert: cheap and
 * correct for a handful of rows. Fire-and-forget from call sites (a failed sync is a re-derivable
 * summary, not data loss — see CLAUDE.md data residency table), so this never throws/rejects: both
 * network failures and PostgREST-reported errors are caught and logged here, not surfaced to the caller.
 */
export async function syncDiningHallRanks(supabase: SupabaseClient, userId: string, rankedDishes: RankedDish[]): Promise<void> {
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
 * Pushes dish favorites to favorited_foods for the favorited-food-elsewhere alert Edge Function — only ever called by the app when the user is signed in AND has notifications enabled (see CLAUDE.md data residency table). Delete-then-insert, same pattern as syncDiningHallRanks.
 *
 * Has two call sites (mobile's and web's notifications toggle handlers) and neither wraps it in a
 * try/catch, so — same contract as syncDiningHallRanks — this never throws/rejects. A PostgREST
 * error is returned as `{ error }` instead, so the caller can log it and keep going rather than
 * having the rest of the toggle handler (push token registration, push_tokens.delete) silently
 * abort. See #45.
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
 * row -- the per-stat opt-in/opt-out primitive behind #94's privacy settings ("share hall
 * completion / top foods / hall ranking with friends", each independently, default all-off).
 * PostgREST's upsert only SETs the columns present in the request body on conflict, so a payload
 * naming just `field` can never clobber the other two stat columns -- toggling "top foods" on/off
 * never touches `completion` or `hall_ranks`, even on a user's very first opt-in (which inserts the
 * row for the first time, leaving the other two columns at their NULL default).
 *
 * `value: null` is how a revoke is expressed -- the caller sends the field with an explicit null,
 * which PostgREST writes as SQL NULL (not a JSON null; see the shared_stats migration's check
 * constraints), actually deleting that field's data rather than merely pausing future updates.
 *
 * Same never-throws contract as syncDiningHallRanks/syncFavoritedFoods above: a toggle handler
 * awaits this directly with no try/catch (see mobile/src/app/privacy.tsx), so a network failure or
 * RLS/PostgREST error resolves as `{ error }` instead of rejecting -- the caller decides whether to
 * roll the toggle back in the UI, rather than the promise chain dying silently mid-flight.
 */
export async function syncSharedStat(supabase: SupabaseClient, userId: string, field: SharedStatField, value: unknown | null): Promise<{ error: unknown }> {
  try {
    const { error } = await supabase.from("shared_stats").upsert({ user_id: userId, [field]: value });
    return { error };
  } catch (err) {
    return { error: err };
  }
}
