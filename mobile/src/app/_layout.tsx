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
      }}
    >
      {/* index (the 3-pane shell), halls/[slug], grab-n-go/[slug], cafe/[name], and logs draw their own canvas-style headers. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="redirect" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="halls/[slug]" options={{ headerShown: false }} />
      <Stack.Screen name="grab-n-go/[slug]" options={{ headerShown: false }} />
      <Stack.Screen name="cafe/[name]" options={{ headerShown: false }} />
      <Stack.Screen name="logs" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="filters" options={{ title: "Dietary Filters" }} />
      <Stack.Screen name="favorites" options={{ title: "Favorites" }} />
      <Stack.Screen name="rank" options={{ title: "Rank Dishes" }} />
      <Stack.Screen name="friends" options={{ title: "Friends" }} />
      <Stack.Screen name="privacy" options={{ title: "Privacy" }} />
      <Stack.Screen name="friend/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="events" options={{ title: "Events" }} />
      <Stack.Screen name="event-detail" options={{ title: "Event" }} />
      <Stack.Screen name="press" options={{ title: "Press" }} />
      <Stack.Screen name="newsletter" options={{ title: "Newsletter" }} />
    </Stack>
  );
}
