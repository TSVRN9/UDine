import { syncFavoritedFoods, type Favorite } from "@udine/shared";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { supabase } from "./supabase";
import { SqliteFavoritesStorage } from "./favoritesStorage";
import { withTimeout } from "./withTimeout";
import { currentSignOutEpoch } from "./signOutEpoch";

const PLATFORM = "expo" as const;

// #45: see the original notifications.tsx doc comment this was extracted from (git blame) --
// every awaited network/native step in toggleNotifications is timeout-bounded and logged with
// its own label so a stall is localized instead of silent/indistinguishable from a later step.
const STEP_TIMEOUT_MS = 15000;

/** Requests permission and returns an Expo push token, or null if denied/unavailable (e.g. no FCM creds yet). */
async function registerForPushToken(): Promise<string | null> {
  try {
    console.log("[push] checking notification permission...");
    const { status: existing } = await withTimeout(Notifications.getPermissionsAsync(), STEP_TIMEOUT_MS, "getPermissionsAsync");
    let status = existing;
    if (status !== "granted") {
      ({ status } = await withTimeout(Notifications.requestPermissionsAsync(), STEP_TIMEOUT_MS, "requestPermissionsAsync"));
    }
    console.log(`[push] permission status=${status}`);
    if (status !== "granted") return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    console.log(`[push] resolved projectId=${JSON.stringify(projectId)}`);
    console.log("[push] calling getExpoPushTokenAsync...");
    const { data } = await withTimeout(Notifications.getExpoPushTokenAsync({ projectId }), STEP_TIMEOUT_MS, "getExpoPushTokenAsync");
    console.log(`[push] getExpoPushTokenAsync resolved: ${data}`);
    return data;
  } catch (e) {
    console.warn("[push] registerForPushToken failed or timed out", e);
    return null;
  }
}

/** Re-upserts this device's push token without ever prompting for permission -- called from
 * refresh() (mount/focus) so alerts self-heal after this device's push_tokens row is cleared
 * server-side without the user's own action (e.g. #257's sign-out cleanup on this device, or a
 * multi-device sign-out on another device -- see auth.ts's own doc comment on
 * clearThisAccountsExpoTokens). Only requestPermissionsAsync (inside toggle(), user-initiated) may
 * prompt; if the OS permission isn't already granted here, there's nothing to silently re-register.
 *
 * #264 review round 3: this function's own getExpoPushTokenAsync call is a real network round
 * trip that can still be in flight when the user taps "Sign out" -- if our upsert lands AFTER
 * auth.ts's signOut() has already deleted this exact row, we'd silently recreate it under the
 * now-signed-out user, reintroducing #257. signOutEpoch's currentSignOutEpoch() is captured before
 * that round trip starts and re-checked right after the upsert resolves; a mismatch means a
 * sign-out ran in between, so the row we just wrote gets deleted right back out. See
 * signOutEpoch.ts's own doc comment for why this has to be an after-the-fact check, not a
 * before-the-fact guard. */
async function reregisterPushToken(client: SupabaseClient, userId: string): Promise<void> {
  const epochAtStart = currentSignOutEpoch();
  try {
    const { status } = await withTimeout(Notifications.getPermissionsAsync(), STEP_TIMEOUT_MS, "getPermissionsAsync (refresh)");
    if (status !== "granted") return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await withTimeout(Notifications.getExpoPushTokenAsync({ projectId }), STEP_TIMEOUT_MS, "getExpoPushTokenAsync (refresh)");
    if (!token) return;

    const { error } = await withTimeout(
      client.from("push_tokens").upsert({ user_id: userId, platform: PLATFORM, token }),
      STEP_TIMEOUT_MS,
      "push_tokens.upsert (refresh)",
    );
    if (error) {
      console.warn("[push] refresh: push_tokens.upsert failed", error);
      return;
    }

    if (currentSignOutEpoch() !== epochAtStart) {
      console.warn("[push] refresh: a sign-out raced this re-registration -- undoing the upsert");
      const { error: undoError } = await withTimeout(
        client.from("push_tokens").delete().eq("user_id", userId).eq("platform", PLATFORM).eq("token", token),
        STEP_TIMEOUT_MS,
        "push_tokens.delete (refresh undo)",
      );
      if (undoError) console.warn("[push] refresh: undoing a racing push_tokens upsert failed", undoError);
    }
  } catch (e) {
    console.warn("[push] refresh: re-registering push token failed", e);
  }
}

const favoritesStorage = new SqliteFavoritesStorage();

export interface FavoriteFoodAlerts {
  session: Session | null;
  notificationsEnabled: boolean;
  favoritesCount: number;
  toggle: (next: boolean) => Promise<{ error: string | null }>;
}

/**
 * Extracted from app/notifications.tsx (#182) so the You pane's "Your data" screen can render the
 * exact same favorite-food-alerts toggle (same `notifications_enabled` read/write, same
 * favorited_foods sync, same push-token register/upsert/delete, same #146 bail-out-on-error
 * semantics) without re-deriving that error-handling chain -- #158/#165/#167's conventions are
 * pinned by notificationsScreen.test.tsx via NotificationsBody, which now just calls this hook.
 * `favoritesCount` is the one addition: the You-pane copy needs "N favorites" in its sub-line,
 * which the standalone /notifications screen never rendered.
 */
export function useFavoriteFoodAlerts(client: SupabaseClient = supabase): FavoriteFoodAlerts {
  const [session, setSession] = useState<Session | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [favoritesCount, setFavoritesCount] = useState(0);

  useEffect(() => {
    client.auth.getSession().then(({ data }: { data: { session: Session | null } }) => setSession(data.session));
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event: unknown, newSession: Session | null) => setSession(newSession));
    return () => subscription.unsubscribe();
  }, [client]);

  const refresh = useCallback(async () => {
    if (!session) return;
    const { data: profile } = await client.from("profiles").select("notifications_enabled").eq("user_id", session.user.id).single();
    const enabled = profile?.notifications_enabled ?? false;
    setNotificationsEnabled(enabled);
    const favorites = await favoritesStorage.getFavorites();
    setFavoritesCount(favorites.length);
    // #264 finding 1: without this, a device whose push_tokens row was cleared server-side (this
    // device's own sign-out, or another device's) shows the toggle ON forever with nothing behind
    // it -- check-favorited-foods dispatches to a row that no longer exists. Runs on every
    // focus/session-change while enabled; upsert is idempotent, so a no-op re-register when the
    // row already exists is harmless.
    if (enabled) await reregisterPushToken(client, session.user.id);
  }, [session, client]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function toggle(next: boolean): Promise<{ error: string | null }> {
    if (!session) return { error: null };
    try {
      console.log(`[push] toggleNotifications(${next}): writing notifications_enabled...`);
      const { error: profileError } = await withTimeout(
        client.from("profiles").update({ notifications_enabled: next }).eq("user_id", session.user.id),
        STEP_TIMEOUT_MS,
        "profiles.update(notifications_enabled)",
      );
      // #146: bail out before touching favorites/push-token state -- see the doc comment on
      // this hook and the original notifications.tsx history for why the switch (and the
      // server-derived state) must stay exactly as they were on this path.
      if (profileError) {
        console.warn(`[push] toggleNotifications(${next}): profiles.update failed`, profileError);
        return { error: "Couldn't update notifications" };
      }
      setNotificationsEnabled(next);

      const favorites: Favorite[] = next ? await favoritesStorage.getFavorites() : [];
      setFavoritesCount(favorites.length);
      console.log(`[push] toggleNotifications(${next}): syncing favorited_foods (${favorites.length})...`);
      const { error: favoritesSyncError } = await withTimeout(syncFavoritedFoods(client, session.user.id, favorites), STEP_TIMEOUT_MS, "syncFavoritedFoods");
      if (favoritesSyncError) console.warn(`[push] toggleNotifications(${next}): syncFavoritedFoods failed`, favoritesSyncError);

      if (next) {
        const token = await registerForPushToken();
        if (token) {
          console.log("[push] toggleNotifications: upserting push_tokens row...");
          const { error: upsertError } = await withTimeout(
            client.from("push_tokens").upsert({ user_id: session.user.id, platform: PLATFORM, token }),
            STEP_TIMEOUT_MS,
            "push_tokens.upsert",
          );
          if (upsertError) console.warn("[push] toggleNotifications: push_tokens.upsert failed", upsertError);
        }
      } else {
        const { error: deleteError } = await withTimeout(
          client.from("push_tokens").delete().eq("user_id", session.user.id).eq("platform", PLATFORM),
          STEP_TIMEOUT_MS,
          "push_tokens.delete",
        );
        if (deleteError) console.warn("[push] toggleNotifications: push_tokens.delete failed", deleteError);
      }
      return { error: null };
    } catch (e) {
      // A timeout/unexpected exception here -- same as the pre-extraction code, this is logged
      // and swallowed rather than surfaced as a user-facing error: if it happened before
      // setNotificationsEnabled(next) ran (a profiles.update timeout), the switch already never
      // optimistically flipped, same "stays off on failure" guarantee as the {error} path above.
      console.warn(`[push] toggleNotifications(${next}) failed`, e);
      return { error: null };
    }
  }

  return { session, notificationsEnabled, favoritesCount, toggle };
}
