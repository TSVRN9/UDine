import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "UDine" }} />
      <Stack.Screen name="halls/[slug]" options={{ title: "Menu" }} />
      <Stack.Screen name="today" options={{ title: "Today" }} />
      <Stack.Screen name="filters" options={{ title: "Dietary Filters" }} />
      <Stack.Screen name="favorites" options={{ title: "Favorites" }} />
      <Stack.Screen name="events" options={{ title: "Events" }} />
      <Stack.Screen name="press" options={{ title: "Press" }} />
      <Stack.Screen name="faq" options={{ title: "FAQ" }} />
    </Stack>
  );
}
