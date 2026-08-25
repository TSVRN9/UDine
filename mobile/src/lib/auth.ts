import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";

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
 */
export async function signInWithGoogle(): Promise<void> {
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
    if (result.type !== "success") return; // user cancelled/dismissed

    const { queryParams } = Linking.parse(result.url);
    const code = queryParams?.code;
    if (typeof code !== "string") {
      throw new Error(`OAuth callback missing "code" param: ${result.url}`);
    }

    await exchangeCode(code);
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

/**
 * Best-effort delete of `userId`'s push_tokens row(s), scoped to `user_id` + `platform` -- the
 * same shape favoriteFoodAlerts.ts's toggle-off already uses (:124), reused here rather than
 * re-fetching the Expo token. A failure here must never surface to the caller: signOut proceeds
 * either way (#257 -- the user asked to leave, and worst case is one stale row that a later
 * toggle-off or `deleteServerData` cleans up).
 *
 * ponytail: unlike web's signOut() (+layout.svelte), this isn't scoped to *this device's* token --
 * it deletes every row for `userId` + "expo", i.e. every phone/tablet they've registered. That's
 * exactly the row-set favoriteFoodAlerts.ts's toggle-off already deletes, so it's provably safe
 * there (notifications_enabled flips false in the same call, so any other device's surviving row
 * goes inert). Here there's no such flip -- deliberately, see signOut()'s own doc comment -- so a
 * second device stays "alerts on" with its push_tokens row silently gone until its own next
 * register (e.g. its next toggle-off/on, or its own sign-out/sign-in). The issue that opened this
 * PR (#257) explicitly ruled out re-fetching the Expo token to scope this the way web scopes by
 * subscription, so this accepts that ceiling rather than reintroducing a token fetch. Upgrade path
 * if a multi-device user reports silently-dead alerts: give push_tokens an `id`/last-seen column
 * (or expose the registered token from state, the way the web subscription already is) and delete
 * by that instead of the whole `user_id` + `platform` pair.
 */
async function clearThisAccountsExpoTokens(userId: string): Promise<void> {
  try {
    const { error } = await supabase.from("push_tokens").delete().eq("user_id", userId).eq("platform", PLATFORM);
    if (error) console.warn("[auth] signOut: push_tokens delete failed", error);
  } catch (e) {
    console.warn("[auth] signOut: push_tokens delete threw", e);
  }
}

/**
 * #257: a shared device previously kept dispatching the signed-out user's favorited-food alerts to
 * whoever picked it up next, because push_tokens was only ever cleared by the alerts toggle-off or
 * deleteServerData -- never by signOut() itself. The delete has to happen BEFORE
 * supabase.auth.signOut(): once the session is gone, RLS no longer lets this device touch that row.
 *
 * Deliberately does NOT flip notifications_enabled to false -- that's the user's stored preference
 * for when they sign back in (on this device or another), not device-scoped state. Leaving it
 * alone means alerts resume automatically on their next sign-in without them having to re-opt-in.
 * See clearThisAccountsExpoTokens's own doc comment for the one case that combination doesn't
 * fully cover (a second device left silently un-alerting until its own next register).
 */
export async function signOut(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (userId) await clearThisAccountsExpoTokens(userId);
  } catch (e) {
    console.warn("[auth] signOut: reading session for push_tokens cleanup failed", e);
  }
  await supabase.auth.signOut();
}
