import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Delete server data" for the privacy screen. Two buckets of steps:
 *
 * - RETRYABLE: friendships, favorited_foods, shared_stats, favorite_dining_halls, push_tokens, and
 *   pings (sender-side only -- a ping sent TO this user has no matching receiver-delete policy and
 *   survives) all have an owner DELETE policy + grant. A failure here is a genuine, transient thing
 *   (network blip, RLS regression) worth telling the user to retry.
 *
 *   "notifications" (`profiles.update({ notifications_enabled: false, discoverable: false })`) must
 *   run before the push_tokens delete: otherwise favoriteFoodAlerts.ts's refresh() self-heal could
 *   see notifications_enabled still true and re-register a push_tokens row right after it's deleted.
 *
 * - UNDELETABLE (known, permanent, not a bug to retry): profiles, food_sightings, and qr_tokens have
 *   no owner DELETE policy or grant. All three are still attempted -- honest about what the backend
 *   actually allows -- but a denial here goes into a separate `undeletableSteps` bucket so `ok` (and
 *   the UI's "try again" copy) only reflects steps that could plausibly succeed on retry.
 *
 *   profiles is deliberate, not an oversight: `handle_new_user()` only fires on signup, never on
 *   sign-in, so deleting the profiles row would leave a returning user with no row recreated -- no
 *   display_name/email/discoverable, and friends could no longer see them. A real "delete my
 *   account" needs the Supabase Auth Admin API to remove the auth.users row too -- a bigger feature
 *   than a client-side RLS policy, not built here. food_sightings and qr_tokens don't share that
 *   recreate-on-signin hazard, so an owner DELETE policy on either would likely be safe to add.
 *
 * Received pings (a friend's own sent-to-this-user row) aren't attempted at all -- there's no
 * receiver-delete policy to even try. Surfaced as static "stays" copy in privacy.tsx instead.
 *
 * Never throws: each step's `{ error }` is collected, and the caller decides how to render a
 * partial failure.
 *
 * Assumes a denied delete (missing grant or RLS) always comes back as a non-null `{ error }`
 * (PostgREST returns 42501/permission-denied, never a silent zero-rows-affected success) -- that's
 * how profiles/food_sightings/qr_tokens end up in `undeletableSteps` every real run.
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
    ["notifications", true, () => supabase.from("profiles").update({ notifications_enabled: false, discoverable: false }).eq("user_id", userId)],
    ["push_tokens", true, () => supabase.from("push_tokens").delete().eq("user_id", userId)],
    ["pings", true, () => supabase.from("pings").delete().eq("sender_id", userId)],
    ["profiles", false, () => supabase.from("profiles").delete().eq("user_id", userId)],
    ["food_sightings", false, () => supabase.from("food_sightings").delete().eq("user_id", userId)],
    ["qr_tokens", false, () => supabase.from("qr_tokens").delete().eq("user_id", userId)],
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
