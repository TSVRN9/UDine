import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/**
 * AsyncStorage (not expo-secure-store) is deliberate: secure-store has a ~2KB per-key limit and a
 * Supabase session (JWT + refresh token + metadata) routinely exceeds that, causing silent write
 * failures. PKCE flow is required for the native sign-in flow in auth.ts.
 */
export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
