import { Redirect } from "expo-router";

/**
 * Landing spot for the `udine://redirect?code=...` OAuth deep link. The actual PKCE code exchange
 * happens in `signInWithGoogle()` (src/lib/auth.ts) via expo-web-browser's own Android redirect
 * interception (`WebBrowser.openAuthSessionAsync`'s `Linking`-based polyfill — Android has no native
 * auth-session support in expo-web-browser, see its source) racing against the same deep link Expo
 * Router receives here. This route exists only so Router has a real match to land on instead of
 * "Unmatched Route" while that exchange finishes; it immediately bounces back home.
 */
export default function RedirectScreen() {
  return <Redirect href="/" />;
}
