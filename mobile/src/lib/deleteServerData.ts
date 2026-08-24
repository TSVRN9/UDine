import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Delete server data" (#182): friendships, favorited_foods, and shared_stats all have an owner
 * DELETE policy already (see friends_pings_favorited_foods.sql / shared_stats.sql), so those three
 * are deleted here. `profiles` does NOT -- `20260817220000_friends_pings_favorited_foods.sql` only
 * grants the owner SELECT (any signed-in user) and UPDATE (own row); there is no owner DELETE
 * policy. Per this ticket's own process law ("if you find you must touch a policy, STOP and say so
 * in your report instead of adding one"), this does not add one -- profiles.delete() is still
 * attempted (so the behavior is honest about what the current backend actually allows, not
 * silently skipped) and its RLS-denial is folded into the same partial-failure report every other
 * step uses, rather than crashing the other three deletes or claiming full success.
 *
 * Never throws (same contract as syncFavoritedFoods/syncSharedStat): each step's `{ error }` is
 * collected, and the caller decides how to render a partial failure -- matching the #158/#165/#167
 * "surface {error}, truthful UI on partial failure" convention this ticket pins.
 */
export interface DeleteServerDataResult {
  ok: boolean;
  failedSteps: string[];
}

export async function deleteServerData(supabase: SupabaseClient, userId: string): Promise<DeleteServerDataResult> {
  const steps: [string, () => PromiseLike<{ error: unknown }>][] = [
    ["friendships", () => supabase.from("friendships").delete().or(`user_a.eq.${userId},user_b.eq.${userId}`)],
    ["favorited_foods", () => supabase.from("favorited_foods").delete().eq("user_id", userId)],
    ["shared_stats", () => supabase.from("shared_stats").delete().eq("user_id", userId)],
    ["profiles", () => supabase.from("profiles").delete().eq("user_id", userId)],
  ];

  const failedSteps: string[] = [];
  for (const [name, run] of steps) {
    try {
      const { error } = await run();
      if (error) {
        console.warn(`[deleteServerData] ${name} failed`, error);
        failedSteps.push(name);
      }
    } catch (err) {
      console.warn(`[deleteServerData] ${name} threw`, err);
      failedSteps.push(name);
    }
  }

  return { ok: failedSteps.length === 0, failedSteps };
}
