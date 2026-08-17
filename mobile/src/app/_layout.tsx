import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "UDine" }} />
      <Stack.Screen name="halls/[slug]" options={{ title: "Menu" }} />
      <Stack.Screen name="today" options={{ title: "Today" }} />
    </Stack>
  );
}
