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
 * Unlike syncDiningHallRanks, this throws on a PostgREST error instead of swallowing it: it's
 * awaited synchronously by the caller (not fire-and-forget), and a swallowed error here was part
 * of what made #45 ("push token registration silently never completes") so hard to diagnose —
 * this function sits between the notifications_enabled write and push-token registration in the
 * same await chain, so a silently-eaten failure here looks identical to a hang in push
 * registration itself.
 */
export async function syncFavoritedFoods(supabase: SupabaseClient, userId: string, favorites: Favorite[]): Promise<void> {
  const dishNames = favorites.filter((f): f is Extract<Favorite, { type: "dish" }> => f.type === "dish").map((f) => f.dishName);

  const { error: deleteError } = await supabase.from("favorited_foods").delete().eq("user_id", userId);
  if (deleteError) throw new Error(`syncFavoritedFoods: delete failed: ${deleteError.message}`, { cause: deleteError });
  if (dishNames.length === 0) return;

  const { error: insertError } = await supabase.from("favorited_foods").insert(dishNames.map((dishName) => ({ user_id: userId, dish_name: dishName })));
  if (insertError) throw new Error(`syncFavoritedFoods: insert failed: ${insertError.message}`, { cause: insertError });
}
