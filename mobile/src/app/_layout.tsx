import {
  LibreFranklin_400Regular,
  LibreFranklin_500Medium,
  LibreFranklin_600SemiBold,
} from "@expo-google-fonts/libre-franklin";
import { Oswald_500Medium, Oswald_600SemiBold, Oswald_700Bold } from "@expo-google-fonts/oswald";
import { useFonts } from "expo-font";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { registerNotificationHandler } from "../lib/notificationHandler";
import { colors, fonts, fs, radii, spacing } from "../lib/theme";

SplashScreen.preventAutoHideAsync();
registerNotificationHandler();

/**
 * #271: there was no ErrorBoundary anywhere in the app -- no route exported one, so
 * expo-router (`getQualifiedRouteComponent`, which loads this root layout the same way it loads
 * every route) never wrapped anything in a `Try`, and an uncaught render error anywhere in the
 * app was an unrecoverable RN fatal in release. Exporting `ErrorBoundary` here gives the whole
 * app one catch-all: any screen's render error lands here instead of taking the process down.
 * This is the belt for every future shape bug, not just #271's -- it doesn't replace fixing the
 * specific crash the error came from.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  if (__DEV__) console.error(error);
  return (
    <View style={errorStyles.screen}>
      <Text style={errorStyles.title}>Something went wrong</Text>
      <Text style={errorStyles.message}>{error.message}</Text>
      <Pressable style={errorStyles.button} onPress={retry} accessibilityRole="button">
        <Text style={errorStyles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const errorStyles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.cream100, padding: spacing(6), gap: spacing(3) },
  title: { fontFamily: fonts.display700, fontSize: fs(22), color: colors.maroon900, textAlign: "center" },
  message: { fontFamily: fonts.body400, fontSize: fs(15), color: colors.ink900, textAlign: "center" },
  button: { marginTop: spacing(3), backgroundColor: colors.maroon600, borderRadius: radii.md, paddingVertical: spacing(3), paddingHorizontal: spacing(6) },
  buttonText: { fontFamily: fonts.body600, fontSize: fs(16), color: colors.paper50 },
});

export default function RootLayout() {
  // Every screen's styles name these families unconditionally, so hold the splash screen until
  // they're registered — rendering first paints Android's fallback font, then reflows.
  const [fontsLoaded, fontError] = useFonts({
    Oswald_500Medium,
    Oswald_600SemiBold,
    Oswald_700Bold,
    LibreFranklin_400Regular,
    LibreFranklin_500Medium,
    LibreFranklin_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.maroon900 },
        headerTintColor: colors.paper50,
        headerTitleStyle: { fontFamily: fonts.display700 },
        contentStyle: { backgroundColor: colors.cream100 },
        // #281: default header-less. Every route draws its own chrome (back button, title,
        // insets.top padding) unless it's one of the explicit opt-ins below -- this was the
        // third time a route was added without a Stack.Screen entry and silently got a native
        // header on top of its own (#151, #219, #281). A route that's merely absent from this
        // list, or present without an explicit `headerShown`, now inherits `false` -- safe by
        // construction, so a fourth route can't repeat the class. See
        // src/lib/routeHeaderShown.test.ts, which enumerates every route file and guards this
        // invariant.
        //
        // What that guard does NOT check (accepted ceiling, #283 review): headerShown resolving
        // to false only proves no *native* header renders -- it can't prove the screen drew its
        // OWN back affordance. #283 found add-friends.tsx's signed-out branch had exactly this
        // gap (no chevron, unreachable-back dead end) even though headerShown correctly resolved
        // false. Extending the guard to catch that would mean rendering every header-less route
        // with its full dependency graph mocked (supabase session state, router, focus effects)
        // just to probe for a Back-labeled pressable -- disproportionate to the bug class this
        // guards. Documented here instead: every header-less route must draw its own way back,
        // and that's a per-screen review responsibility, not a static-analysis one. Known
        // exemptions (no back needed by design, not an oversight): `index` (tab-shell root),
        // `redirect` (transient OAuth landing), `qr-confirm` (ADD THEM / CANCEL buttons are the
        // affordance, no chevron), `login` ("Continue with Google" and login.tsx:67's "Skip -- use
        // without an account" -> done() -> router.back() are the affordance, no chevron).
        headerShown: false,
      }}
    >
      {/* index (the 3-pane shell), halls/[slug], grab-n-go/[slug], cafe/[name], and logs draw their own canvas-style headers. */}
      <Stack.Screen name="index" />
      <Stack.Screen name="redirect" options={{ animation: "none" }} />
      <Stack.Screen name="halls/[slug]" />
      <Stack.Screen name="grab-n-go/[slug]" />
      <Stack.Screen name="cafe/[name]" />
      <Stack.Screen name="logs" />
      <Stack.Screen name="login" options={{ animation: "fade" }} />
      {/* These are the only routes that want the native maroon header instead of their own chrome. */}
      <Stack.Screen name="filters" options={{ headerShown: true, title: "Dietary Filters" }} />
      <Stack.Screen name="favorites" options={{ headerShown: true, title: "Favorites" }} />
      <Stack.Screen name="rank" options={{ headerShown: true, title: "Rank Dishes" }} />
      <Stack.Screen name="friends" options={{ headerShown: true, title: "Friends" }} />
      <Stack.Screen name="friend/[id]" />
      <Stack.Screen name="notifications" options={{ headerShown: true, title: "Notifications" }} />
      <Stack.Screen name="events" options={{ headerShown: true, title: "Events" }} />
      <Stack.Screen name="event-detail" options={{ headerShown: true, title: "Event" }} />
      <Stack.Screen name="press" options={{ headerShown: true, title: "Press" }} />
      <Stack.Screen name="newsletter" options={{ headerShown: true, title: "Newsletter" }} />
      {/* privacy, add-friends, add-friend-qr, export, qr-confirm need no entry at all: they draw
          their own chrome and now correctly inherit headerShown: false from screenOptions above. */}
    </Stack>
  );
}
