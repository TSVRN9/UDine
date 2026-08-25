import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Delete server data" (#182, fixed for real in #237).
 *
 * Two buckets of steps, not one:
 *
 * - RETRYABLE: friendships, favorited_foods, shared_stats, favorite_dining_halls, push_tokens, and
 *   pings (sender-side only -- "senders can retract their pings" has no matching receiver-delete
 *   policy, so a ping someone sent TO this user survives; that's a real gap, noted in the PR body,
 *   not fixed here) all have an owner DELETE policy + grant today (see
 *   20260817213000_favorite_dining_halls.sql / 20260817220000_friends_pings_favorited_foods.sql /
 *   20260818130000_grant_authenticated_table_access.sql). A failure here is a genuine, transient
 *   thing (network blip, RLS regression) worth telling the user to retry.
 *
 * - UNDELETABLE (known, permanent, not a bug to retry): profiles and food_sightings have no owner
 *   DELETE policy or grant. Both are still attempted -- honest about what the backend actually
 *   allows, not silently skipped -- but a denial here is folded into a SEPARATE bucket from
 *   `failedSteps` so `ok` (and the UI's "try again" copy) only ever reflects the steps that could
 *   plausibly succeed on retry.
 *
 *   profiles specifically was a deliberate decision, not an oversight: `handle_new_user()` (see
 *   20260817220000_friends_pings_favorited_foods.sql) only fires `after insert on auth.users`, i.e.
 *   at signup, never at sign-in. Delete the profiles row and the same user signing back in gets NO
 *   new row -- no display_name/email/discoverable, and the profiles SELECT policy's "existing
 *   relationship" arm can no longer render them to friends (20260824150000). Nothing in this schema
 *   recreates it. #204 also went the other direction on this exact table, narrowing writes to a
 *   column grant rather than widening them. A real "delete my account" needs the Supabase Auth
 *   Admin API (service role) to remove the auth.users row too, which is a different, bigger feature
 *   than a client-side RLS policy -- not built here.
 *
 *   food_sightings has none of profiles' recreate-on-signin hazard (it's just notification-history
 *   rows), so an owner DELETE policy would likely be safe to add -- left as a question for the PR
 *   body rather than added unasked, per the issue's own "raise whether it needs one" framing (profiles
 *   got "decide", food_sightings got "raise").
 *
 * Never throws (same contract as syncFavoritedFoods/syncSharedStat): each step's `{ error }` is
 * collected, and the caller decides how to render a partial failure -- matching the #158/#165/#167
 * "surface {error}, truthful UI on partial failure" convention this ticket pins.
 */
export interface DeleteServerDataResult {
  /** True iff every RETRYABLE step succeeded. Ignores `undeletableSteps` -- those are expected to
   * "fail" every time until a policy exists, so they must never gate a reachable success path. */
  ok: boolean;
  /** Retryable steps that failed this run (network blip, RLS regression, ...). Worth "try again". */
  failedSteps: string[];
  /** Steps attempted but denied for the known, permanent reason documented above. Never disappears
   * on retry -- the UI should say what remains and why, not "try again". */
  undeletableSteps: string[];
}

type Step = readonly [name: string, retryable: boolean, run: () => PromiseLike<{ error: unknown }>];

export async function deleteServerData(supabase: SupabaseClient, userId: string): Promise<DeleteServerDataResult> {
  const steps: Step[] = [
    ["friendships", true, () => supabase.from("friendships").delete().or(`user_a.eq.${userId},user_b.eq.${userId}`)],
    ["favorited_foods", true, () => supabase.from("favorited_foods").delete().eq("user_id", userId)],
    ["shared_stats", true, () => supabase.from("shared_stats").delete().eq("user_id", userId)],
    ["favorite_dining_halls", true, () => supabase.from("favorite_dining_halls").delete().eq("user_id", userId)],
    ["push_tokens", true, () => supabase.from("push_tokens").delete().eq("user_id", userId)],
    ["pings", true, () => supabase.from("pings").delete().eq("sender_id", userId)],
    ["profiles", false, () => supabase.from("profiles").delete().eq("user_id", userId)],
    ["food_sightings", false, () => supabase.from("food_sightings").delete().eq("user_id", userId)],
  ];

  const failedSteps: string[] = [];
  const undeletableSteps: string[] = [];
  for (const [name, retryable, run] of steps) {
    try {
      const { error } = await run();
      if (error) {
        console.warn(`[deleteServerData] ${name} failed`, error);
        (retryable ? failedSteps : undeletableSteps).push(name);
      }
    } catch (err) {
      console.warn(`[deleteServerData] ${name} threw`, err);
      (retryable ? failedSteps : undeletableSteps).push(name);
    }
  }

  return { ok: failedSteps.length === 0, failedSteps, undeletableSteps };
}
