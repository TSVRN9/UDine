import {
  LibreFranklin_400Regular,
  LibreFranklin_500Medium,
  LibreFranklin_600SemiBold,
} from "@expo-google-fonts/libre-franklin";
import { Oswald_500Medium, Oswald_600SemiBold, Oswald_700Bold } from "@expo-google-fonts/oswald";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { colors, fonts } from "../lib/theme";

SplashScreen.preventAutoHideAsync();

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
      {/* index (the 3-pane shell) and halls/[slug] draw their own canvas-style headers. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="redirect" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="halls/[slug]" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="filters" options={{ title: "Dietary Filters" }} />
      <Stack.Screen name="favorites" options={{ title: "Favorites" }} />
      <Stack.Screen name="rank" options={{ title: "Rank Dishes" }} />
      <Stack.Screen name="friends" options={{ title: "Friends" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="events" options={{ title: "Events" }} />
      <Stack.Screen name="press" options={{ title: "Press" }} />
      <Stack.Screen name="newsletter" options={{ title: "Newsletter" }} />
    </Stack>
  );
}
