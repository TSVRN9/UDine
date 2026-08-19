import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { exchangeCode, isSignInInFlight, shouldExchangeCode } from "../lib/auth";

/**
 * Landing spot for the `udine://redirect?code=...` OAuth deep link. Two ways to get here:
 *
 * - Warm: the app process was already alive in the Custom Tab round-trip, so
 *   `signInWithGoogle()` (src/lib/auth.ts) is mid-`await`, and expo-web-browser's own Android
 *   redirect interception (`WebBrowser.openAuthSessionAsync`'s `Linking`-based polyfill — Android
 *   has no native auth-session support in expo-web-browser, see its source) races the same deep
 *   link Router receives here and exchanges the code itself. This route just needs to exist so
 *   Router has a real match to land on instead of "Unmatched Route" while that finishes.
 * - Cold (#54): Android killed the app process while it sat in the Custom Tab. There's no
 *   `signInWithGoogle()` call in flight, so nothing consumes the code — the deep link cold-starts
 *   the app straight into this route with `code` as a search param. `isSignInInFlight()` is what
 *   tells these two cases apart (true only in the warm case, since it's in-memory JS state that a
 *   cold start can't have inherited), so this exchanges the code itself only when the warm path
 *   isn't already doing so — otherwise it would double-exchange the single-use PKCE code.
 *
 * Either way, it immediately bounces back home; a successful exchange fires
 * `supabase.auth.onAuthStateChange`, which home already listens for.
 */
export default function RedirectScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    if (shouldExchangeCode(code, isSignInInFlight())) {
      exchangeCode(code).catch((err) => console.error("OAuth cold-start code exchange failed", err));
    }
  }, [code]);

  return <Redirect href="/" />;
}
