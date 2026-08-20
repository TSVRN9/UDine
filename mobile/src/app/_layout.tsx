import { Stack } from "expo-router";
import { colors, fonts } from "../lib/theme";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.maroon900 },
        headerTintColor: colors.paper50,
        headerTitleStyle: { fontFamily: fonts.display, fontWeight: "700" },
        contentStyle: { backgroundColor: colors.cream100 },
      }}
    >
      <Stack.Screen name="index" options={{ title: "UDine" }} />
      <Stack.Screen name="redirect" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="halls/[slug]" options={{ title: "Menu" }} />
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
