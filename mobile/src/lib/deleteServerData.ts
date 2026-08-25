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
 * - UNDELETABLE (known, permanent, not a bug to retry): profiles, food_sightings, and qr_tokens have
 *   no owner DELETE policy or grant. All three are still attempted -- honest about what the backend
 *   actually allows, not silently skipped -- but a denial here is folded into a SEPARATE bucket from
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
 *   food_sightings and qr_tokens have none of profiles' recreate-on-signin hazard (qr_tokens is one
 *   row per user, replaced wholesale by mint_qr_token() the next time the user opens the QR screen
 *   regardless of whether an old row was ever deleted -- see 20260824150000_add_friends_
 *   discoverability_and_qr.sql -- and food_sightings is just notification-history rows), so an owner
 *   DELETE policy on either would likely be safe to add -- left as a question for the PR body rather
 *   than added unasked, per the issue's own "raise whether it needs one" framing (profiles got
 *   "decide", food_sightings got "raise"; qr_tokens is the same shape as food_sightings).
 *
 * Received pings (a friend's own sent-to-this-user row) are not attempted at all, retryable or
 * undeletable -- there is no receiver-delete policy for pings to even try, only the sender-delete
 * one used below. Surfaced as static "stays" copy in privacy.tsx, not as a step here.
 *
 * Never throws (same contract as syncFavoritedFoods/syncSharedStat): each step's `{ error }` is
 * collected, and the caller decides how to render a partial failure -- matching the #158/#165/#167
 * "surface {error}, truthful UI on partial failure" convention this ticket pins.
 *
 * Assumption baked into the retryable/undeletable split: a DENIED delete (missing grant or RLS)
 * always comes back as a non-null `{ error }` -- PostgREST returns 42501/permission-denied, never a
 * silent zero-rows-affected success. That's how profiles/food_sightings/qr_tokens end up in
 * `undeletableSteps` every real run. Nothing here has been exercised against a live PostgREST
 * instance (every test below hands the client a synthetic `{ error }`); if that assumption is ever
 * wrong for some future table, the honest "stays on the server" copy would silently go stale with
 * no test catching it.
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
