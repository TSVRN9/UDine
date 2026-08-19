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

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
