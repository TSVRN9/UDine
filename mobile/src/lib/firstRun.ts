import AsyncStorage from "@react-native-async-storage/async-storage";

// Device-local "has the first-run card been dismissed" flag for the anonymous-first value prop
// (#68, part of epic #63). Zero server calls. AsyncStorage over SQLite (see sqliteStorage.ts) --
// it's already a dependency (src/lib/supabase.ts uses it for the auth session), and a single
// boolean flag doesn't need a table/schema.
const KEY = "udine-first-run-dismissed";

export async function isFirstRunDismissed(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY)) === "true";
}

export async function dismissFirstRun(): Promise<void> {
  await AsyncStorage.setItem(KEY, "true");
}
