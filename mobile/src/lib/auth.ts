import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";
import { withTimeout } from "./withTimeout";
import { pendingSelfHeal } from "./pendingSelfHeal";

WebBrowser.maybeCompleteAuthSession();

// Set for the duration of signInWithGoogle()'s browser round-trip. redirect.tsx reads this (via
// isSignInInFlight) to decide whether the warm path is already handling the OAuth code, so it
// doesn't double-exchange the single-use PKCE code on a cold start (#54).
let signInInFlight = false;

export function isSignInInFlight(): boolean {
  return signInInFlight;
}

/**
 * Pure "should redirect.tsx exchange this code itself" decision, split out from the side-effecting
 * exchange so it's testable without mocking supabase/Linking. False whenever the warm sign-in path
 * (signInWithGoogle, below) is already in flight — `inFlight` isn't keyed to a specific code, but
 * there's only ever one OAuth round-trip active at a time, so "a sign-in is in flight" already
 * means "it's this code's flow." Exchanging twice fails because the code is single-use.
 */
export function shouldExchangeCode(code: unknown, inFlight: boolean): code is string {
  return typeof code === "string" && !inFlight;
}

/**
 * Native OAuth can't use a plain redirect like the web flow does: signInWithOAuth returns the
 * provider's auth URL (skipBrowserRedirect so supabase-js doesn't try to navigate a browser that
 * doesn't exist here), we open it in an auth-session browser tab, then parse the `udine://redirect`
 * deep-link callback for the PKCE `code` and exchange it for a session ourselves.
 *
 * Returns whether a session was actually established, so callers can tell "user cancelled the
 * Google chooser" apart from "signed in" (#278) -- true on a completed exchange, false on a
 * cancel/dismiss. Errors (a real failure, not a user choice) still throw, unchanged.
 */
export async function signInWithGoogle(): Promise<boolean> {
  signInInFlight = true;
  try {
    const redirectTo = Linking.createURL("redirect");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data.url) throw new Error("Supabase did not return an OAuth URL");

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") return false; // user cancelled/dismissed

    const { queryParams } = Linking.parse(result.url);
    const code = queryParams?.code;
    if (typeof code !== "string") {
      throw new Error(`OAuth callback missing "code" param: ${result.url}`);
    }

    await exchangeCode(code);
    return true;
  } finally {
    signInInFlight = false;
  }
}

/**
 * Exchanges an OAuth code cold-started straight into redirect.tsx (app process was killed mid
 * Custom-Tab, so no signInWithGoogle() call is in flight to consume the deep link itself — #54).
 * Caller must gate this on shouldExchangeCode to avoid re-exchanging a code the warm path already
 * consumed.
 */
export async function exchangeCode(code: string): Promise<void> {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
}

// Mirrors favoriteFoodAlerts.ts's PLATFORM constant (not imported -- that module pulls in
// expo-notifications/expo-router/SQLite storage, which auth.ts has no other reason to depend on
// for one string literal).
const PLATFORM = "expo" as const;

// Mirrors favoriteFoodAlerts.ts's STEP_TIMEOUT_MS (#45's convention: every awaited network/native
// call gets its own timeout, so a stall becomes a labeled, catchable error instead of silently
// never resolving). Not imported for the same reason PLATFORM isn't, above.
const SIGN_OUT_STEP_TIMEOUT_MS = 15000;

/**
 * Best-effort delete of `userId`'s push_tokens row(s), scoped to `user_id` + `platform` -- the
 * same shape favoriteFoodAlerts.ts's toggle-off already uses (:124), reused here rather than
 * re-fetching the Expo token. Timeout-bounded and swallows any error/timeout: signOut proceeds
 * either way (#257 -- the user asked to leave), and without the timeout a hung request here would
 * mean auth.signOut() below is never reached at all -- see #45/favoriteFoodAlerts.ts's own
 * STEP_TIMEOUT_MS convention for why every awaited call on this path is wrapped.
 *
 * ponytail: unlike web's signOut() (+layout.svelte), this isn't scoped to *this device's* token --
 * it deletes every row for `userId` + "expo", i.e. every phone/tablet they've registered. That's
 * exactly the row-set favoriteFoodAlerts.ts's toggle-off already deletes, so it's provably safe
 * there (notifications_enabled flips false in the same call, so any other device's surviving row
 * goes inert). Here there's no such flip -- deliberately, see signOut()'s own doc comment -- so a
 * second device's row is gone too. That's downgraded from "permanent" to "until that device next
 * opens the alerts screen (app/notifications.tsx) or the Your-data/privacy screen
 * (app/privacy.tsx)" by favoriteFoodAlerts.ts's reregisterPushToken -- those are the only two
 * screens that mount useFavoriteFoodAlerts, so this can realistically sit for weeks, not "the next
 * general app open." Its toggle stays visibly ON the whole time (never silently flips off), so
 * it's never observed lying -- just possibly stale until one of those two screens is visited
 * again. The issue that opened this PR (#257) explicitly ruled out re-fetching the Expo token to
 * scope this the way web scopes by subscription; re-registration elsewhere makes that unnecessary
 * here rather than working around it with a fetch on the sign-out path itself.
 */
async function clearThisAccountsExpoTokens(userId: string): Promise<void> {
  try {
    const { error } = await withTimeout(
      supabase.from("push_tokens").delete().eq("user_id", userId).eq("platform", PLATFORM),
      SIGN_OUT_STEP_TIMEOUT_MS,
      "push_tokens.delete (signOut)",
    );
    if (error) console.warn("[auth] signOut: push_tokens delete failed", error);
  } catch (e) {
    console.warn("[auth] signOut: push_tokens delete failed or timed out", e);
  }
}

/**
 * #257: a shared device previously kept dispatching the signed-out user's favorited-food alerts to
 * whoever picked it up next, because push_tokens was only ever cleared by the alerts toggle-off or
 * deleteServerData -- never by signOut() itself. The delete has to happen BEFORE
 * supabase.auth.signOut(): once the session is gone, RLS no longer lets this device touch that row.
 * Both awaited steps are timeout-bounded (SIGN_OUT_STEP_TIMEOUT_MS) so a stalled network call can't
 * strand the user mid sign-out -- auth.signOut() below always runs, hang or not.
 *
 * #264 review round 4: favoriteFoodAlerts.ts's self-heal (refresh() re-registering this device's
 * token whenever notifications_enabled is true and permission is already granted) can be mid-flight
 * -- a real Expo push-token network round trip -- when this runs. Two earlier fixes here (a
 * pre-upsert flag, then a post-upsert "compensating delete" keyed off a sign-out epoch counter)
 * both failed: the compensating delete ran *after* auth.signOut() below had already cleared the
 * session, so it 403'd (push_tokens has no anon grant, `20260818130000:39-40`) and the resurrected
 * row stayed -- reviewer-reproduced, not theoretical. Awaiting pendingSelfHeal() HERE, before this
 * function's own delete and before auth.signOut(), removes the race instead of detecting it after
 * the fact: either the self-heal finishes first (and the delete below removes whatever it wrote,
 * with the session still live) or it never started. Bounded by the same timeout as the rest of
 * this path, so a hung self-heal can't hang sign-out -- see the ceiling this leaves in
 * clearThisAccountsExpoTokens's own doc comment (a self-heal upsert whose request was already
 * in flight when the wait times out can still land afterward with its still-valid JWT; #263's
 * server-side unique-token constraint is the backstop for that sliver, not this code).
 *
 * Deliberately does NOT flip notifications_enabled to false -- that's the user's stored preference
 * for when they sign back in (on this device or another), not device-scoped state. Leaving it
 * alone means alerts resume automatically on their next sign-in: favoriteFoodAlerts.ts's refresh()
 * re-registers this device's token whenever notifications_enabled is true and the OS permission is
 * already granted, so the flag staying true is exactly what makes that self-heal happen with no
 * re-opt-in. See clearThisAccountsExpoTokens's own doc comment for the one case that combination
 * doesn't fully cover (a second device, until it next opens one of the two screens that self-heal).
 */
export async function signOut(): Promise<void> {
  const pending = pendingSelfHeal();
  if (pending) {
    try {
      await withTimeout(pending, SIGN_OUT_STEP_TIMEOUT_MS, "pendingSelfHeal (signOut)");
    } catch (e) {
      console.warn("[auth] signOut: waiting for an in-flight self-heal timed out or failed -- proceeding with sign-out anyway", e);
    }
  }
  try {
    const { data } = await withTimeout(supabase.auth.getSession(), SIGN_OUT_STEP_TIMEOUT_MS, "getSession (signOut)");
    const userId = data.session?.user.id;
    if (userId) await clearThisAccountsExpoTokens(userId);
  } catch (e) {
    console.warn("[auth] signOut: reading session for push_tokens cleanup failed or timed out", e);
  }
  await supabase.auth.signOut();
}
