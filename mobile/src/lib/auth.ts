import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

/**
 * Native OAuth can't use a plain redirect like the web flow does: signInWithOAuth returns the
 * provider's auth URL (skipBrowserRedirect so supabase-js doesn't try to navigate a browser that
 * doesn't exist here), we open it in an auth-session browser tab, then parse the `udine://redirect`
 * deep-link callback for the PKCE `code` and exchange it for a session ourselves.
 */
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = Linking.createURL("redirect");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error("Supabase did not return an OAuth URL");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return; // user cancelled/dismissed

  const { queryParams } = Linking.parse(result.url);
  const code = queryParams?.code;
  if (typeof code !== "string") {
    throw new Error(`OAuth callback missing "code" param: ${result.url}`);
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
