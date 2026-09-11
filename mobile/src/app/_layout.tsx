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
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { registerNotificationHandler } from "../lib/notificationHandler";
import { prefetchTodaysMenus } from "../lib/menuPrefetch";
import { colors, fonts, fs, radii, spacing } from "../lib/theme";

SplashScreen.preventAutoHideAsync();
registerNotificationHandler();

// expo-router loads this root layout for every route, so exporting ErrorBoundary here catches
// render errors app-wide instead of an unrecoverable RN fatal in release.
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

const styles = StyleSheet.create({
  root: { flex: 1 },
});

const errorStyles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.cream100, padding: spacing(6), gap: spacing(3) },
  title: { fontFamily: fonts.display700, fontSize: fs(22), color: colors.maroon900, textAlign: "center" },
  message: { fontFamily: fonts.body400, fontSize: fs(15), color: colors.ink900, textAlign: "center" },
  button: { marginTop: spacing(3), backgroundColor: colors.maroon600, borderRadius: radii.md, paddingVertical: spacing(3), paddingHorizontal: spacing(6) },
  buttonText: { fontFamily: fonts.body600, fontSize: fs(16), color: colors.paper50 },
});

export default function RootLayout() {
  // Hold the splash screen until fonts register, or Android briefly paints its fallback font.
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

  useEffect(() => {
    prefetchTodaysMenus();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    // react-native-gesture-handler requires a GestureHandlerRootView ancestor or gestures
    // silently fail to recognize on Android.
    <GestureHandlerRootView style={styles.root}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.maroon900 },
          headerTintColor: colors.paper50,
          headerTitleStyle: { fontFamily: fonts.display700 },
          contentStyle: { backgroundColor: colors.cream100 },
          // iOS native back button falls back to the previous screen's raw route name when no
          // title is set (expo-router's vendored NativeStackView). Pushes from `index`
          // (headerShown:false, no title) would render "index" -- force chevron-only instead.
          headerBackButtonDisplayMode: "minimal",
          // Default header-less: every route draws its own chrome unless it opts in below, so a
          // new route can't silently pick up a native header on top of its own.
          // MVP cut (temporary, see archive/full-features): rank, friends, friend/[id],
          // add-friends, add-friend-qr, qr-confirm, notifications, privacy, login, redirect are
          // shelved along with ranking/friends/account.
          headerShown: false,
        }}
      >
        {/* index (the 3-pane shell), halls/[slug] (Grab 'N Go is its 4th tab now, not its own route
        -- see grabRouteFor), cafe/[name], and logs draw their own canvas-style headers. */}
        <Stack.Screen name="index" />
        <Stack.Screen name="halls/[slug]" />
        <Stack.Screen name="cafe/[name]" />
        <Stack.Screen name="logs" />
        {/* These are the only routes that want the native maroon header instead of their own chrome. */}
        <Stack.Screen name="filters" options={{ headerShown: true, title: "Dietary Filters" }} />
        <Stack.Screen name="favorites" options={{ headerShown: true, title: "Favorites" }} />
        <Stack.Screen name="event-detail" options={{ headerShown: true, title: "Event" }} />
        <Stack.Screen name="press" options={{ headerShown: true, title: "Press" }} />
        <Stack.Screen name="newsletter" options={{ headerShown: true, title: "Newsletter" }} />
        {/* export needs no entry at all: it draws its own chrome and inherits headerShown: false. */}
      </Stack>
    </GestureHandlerRootView>
  );
}
