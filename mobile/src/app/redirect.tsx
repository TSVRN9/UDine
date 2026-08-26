import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet } from "react-native";
import { colors } from "../lib/theme";
import { exchangeCode, isSignInInFlight, shouldExchangeCode } from "../lib/auth";
import { withTimeout } from "../lib/withTimeout";

// Mirrors auth.ts's SIGN_OUT_STEP_TIMEOUT_MS (#45's convention: every awaited network/native call
// gets its own timeout, so a stall becomes a labeled, catchable error instead of silently never
// resolving). Not imported from there for the same reason auth.ts doesn't import PLATFORM/
// SIGN_OUT_STEP_TIMEOUT_MS from elsewhere -- this is the one call site that needs it here.
// #280: without this, a cold-start exchange that never settles (not a reject, a true hang -- a
// stalled network request to Supabase) would leave `ready` false forever, stranding the user on
// this screen's spinner with no back affordance (<Redirect> is the only exit and it never fires).
const EXCHANGE_TIMEOUT_MS = 15000;

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
 * Either way, it bounces back home once any exchange it owns has settled (#280 -- see the `ready`
 * gate below); a successful exchange fires `supabase.auth.onAuthStateChange`, which home already
 * listens for.
 */
export default function RedirectScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  // #280: index.tsx's first-run check races this screen's exchange -- getSession() sees no
  // session yet if index mounts (via <Redirect> below) while the cold-start exchange is still on
  // the wire, producing one spurious /login push. Gating the redirect on the exchange settling
  // (both success and failure -- see the .finally below) closes that race; the warm path has
  // nothing to await (shouldExchangeCode already said so) so it stays effectively synchronous.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (shouldExchangeCode(code, isSignInInFlight())) {
      // console.error alone is invisible in a release build — a user whose cold exchange fails
      // (e.g. an expired code) would complete Google consent and land silently signed out, which
      // is exactly #54's complaint. Alert.alert is native, so it survives this screen's immediate
      // <Redirect> unmount, same as the warm path's identical failure surface (index.tsx).
      withTimeout(exchangeCode(code), EXCHANGE_TIMEOUT_MS, "exchangeCode (cold start)")
        .catch((err) => {
          console.error("OAuth cold-start code exchange failed", err);
          Alert.alert("Sign-in failed", err instanceof Error ? err.message : String(err));
        })
        .finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, [code]);

  if (!ready) return <ActivityIndicator style={styles.loading} color={colors.maroon600} />;
  return <Redirect href="/" />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.cream100 },
});
