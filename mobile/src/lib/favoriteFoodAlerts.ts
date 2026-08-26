import { syncFavoritedFoods, type Favorite } from "@udine/shared";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { supabase } from "./supabase";
import { SqliteFavoritesStorage } from "./favoritesStorage";
import { withTimeout } from "./withTimeout";
import { pendingSelfHeal, registerPendingSelfHeal } from "./pendingSelfHeal";
import { hasSyncedFavorites, markFavoritesSynced } from "./favoritesSyncMarker";

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

/** Re-registers this device's push token without ever prompting for permission -- called from
 * refresh() (mount/focus) so alerts self-heal after this device's push_tokens row is cleared
 * server-side without the user's own action (e.g. #257's sign-out cleanup on this device, or a
 * multi-device sign-out on another device -- see auth.ts's own doc comment on
 * clearThisAccountsExpoTokens). Only requestPermissionsAsync (inside toggle(), user-initiated) may
 * prompt; if the OS permission isn't already granted here, there's nothing to silently re-register.
 *
 * #264 review round 4: this function's own getExpoPushTokenAsync call is a real network round
 * trip that can still be in flight when the user taps "Sign out" -- refresh() below registers this
 * function's own promise via registerPendingSelfHeal so auth.ts's signOut() can await it (bounded)
 * BEFORE its own delete, instead of racing it. See pendingSelfHeal.ts's own doc comment for why
 * that ordering, not a post-upsert compensating delete, is what actually closes the race. */
async function reregisterPushToken(client: SupabaseClient): Promise<{ granted: boolean }> {
  try {
    const { status } = await withTimeout(Notifications.getPermissionsAsync(), STEP_TIMEOUT_MS, "getPermissionsAsync (refresh)");
    // PR #286 review (Part B): the caller (refresh()) uses this to decide whether the toggle can
    // honestly render ON. `granted` reflects the OS permission specifically -- not token issuance
    // or RPC success below, which are separate failure modes already logged on their own.
    if (status !== "granted") return { granted: false };

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await withTimeout(Notifications.getExpoPushTokenAsync({ projectId }), STEP_TIMEOUT_MS, "getExpoPushTokenAsync (refresh)");
    if (!token) return { granted: true };

    // #263: a raw upsert here would 23505 against push_tokens' unique(platform, token) once this
    // token is shared with another user -- register_push_token evicts that other owner first, same
    // as toggle()'s own registration below. It derives the owner from auth.uid(), so userId is no
    // longer needed here.
    const { error } = await withTimeout(
      client.rpc("register_push_token", { p_platform: PLATFORM, p_token: token }),
      STEP_TIMEOUT_MS,
      "register_push_token (refresh)",
    );
    if (error) console.warn("[push] refresh: register_push_token failed", error);
    return { granted: true };
  } catch (e) {
    console.warn("[push] refresh: re-registering push token failed", e);
    // Fail toward the honest state, not the optimistic one: an unexpected timeout/exception here
    // means this device's permission status is genuinely unknown, so don't claim it's granted.
    return { granted: false };
  }
}

const favoritesStorage = new SqliteFavoritesStorage();

export interface FavoriteFoodAlerts {
  session: Session | null;
  notificationsEnabled: boolean;
  favoritesCount: number;
  /** PR #286 review (Part B, both rounds): true when `notificationsEnabled` is true server-side but
   * this device/account combination isn't actually working yet -- either OS notification permission
   * isn't granted (a new user whose `notifications_enabled` defaulted true, 2026-08-26 #248, never
   * tapped anything), OR permission IS granted but this account's favorites were never actually
   * synced from THIS device (round 2: a second account signing in on a phone that already granted
   * this app permission -- #263's own scenario -- or Android <=12, which never asks; refresh()'s
   * self-heal registers a push token in both cases without toggle() ever running, so
   * favorited_foods can be genuinely empty server-side even with a token registered). A caller must
   * render this as a needs-action state, not a working ON toggle -- see privacy.tsx/notifications.tsx,
   * which show the toggle visually off (`notificationsEnabled && !needsPermission`) and swap the
   * sub-line to a "tap to finish enabling" prompt. Tapping it calls the same `toggle(true)` below,
   * the only path that ever calls `requestPermissionsAsync` OR `syncFavoritedFoods` -- passive
   * navigation still never prompts or wipes favorites (see favoritesSyncMarker.ts's own doc comment
   * on why syncFavoritedFoods can never safely run from refresh()). */
  needsPermission: boolean;
  toggle: (next: boolean) => Promise<{ error: string | null }>;
  /** Re-runs the same mount/focus refresh this hook already does on its own (server-read of
   * notifications_enabled + self-heal) -- exposed so a caller that just mutated server state out
   * from under this hook (#272: deleteServerData turning notifications_enabled off) can pull the
   * new value in immediately instead of waiting for this screen's next focus. */
  refresh: () => Promise<void>;
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
  const [needsPermission, setNeedsPermission] = useState(false);

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
    // row already exists is harmless. Registered via registerPendingSelfHeal so a concurrent
    // signOut() can wait for this specific call rather than racing it (#264 review round 4).
    if (enabled) {
      const selfHeal = reregisterPushToken(client);
      // pendingSelfHeal's contract is Promise<void> (signOut()/confirmDelete just await settlement,
      // they don't need the result) -- reregisterPushToken's own richer { granted } result is read
      // separately below via the same `selfHeal` promise (already-settled promises can be awaited
      // more than once).
      registerPendingSelfHeal(selfHeal.then(() => undefined));
      const { granted } = await selfHeal;
      // PR #286 review round 2: granted permission alone isn't enough -- this account's favorites
      // may never have been synced from THIS device (see needsPermission's own doc comment above).
      const synced = granted && (await hasSyncedFavorites(session.user.id));
      setNeedsPermission(!synced);
    } else {
      setNeedsPermission(false);
    }
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
      // PR #286 review (Part B): toggle-off has nothing left to need; toggle-on's real answer comes
      // from registerForPushToken() below (the only call in this hook allowed to prompt), set once
      // its result -- token or not -- is known.
      if (!next) setNeedsPermission(false);

      const favorites: Favorite[] = next ? await favoritesStorage.getFavorites() : [];
      setFavoritesCount(favorites.length);
      console.log(`[push] toggleNotifications(${next}): syncing favorited_foods (${favorites.length})...`);
      const { error: favoritesSyncError } = await withTimeout(syncFavoritedFoods(client, session.user.id, favorites), STEP_TIMEOUT_MS, "syncFavoritedFoods");
      if (favoritesSyncError) console.warn(`[push] toggleNotifications(${next}): syncFavoritedFoods failed`, favoritesSyncError);
      // #286 round 2: only a REAL synced state counts -- a failed sync must not be mistaken for a
      // done one (see favoritesSyncMarker.ts's own doc comment on why refresh() can't just re-derive
      // this by calling syncFavoritedFoods itself).
      else if (next) await markFavoritesSynced(session.user.id);

      if (next) {
        const token = await registerForPushToken();
        // Needs action unless BOTH permission is granted (a token exists) AND favorites actually
        // synced just now (no favoritesSyncError) -- either half missing means this device isn't
        // really working yet, even though notificationsEnabled is (optimistically) true above.
        setNeedsPermission(!token || Boolean(favoritesSyncError));
        if (token) {
          // #263: a raw upsert let the same shared-device token sit under N users (push_tokens now
          // has a unique(platform, token) backstop that would reject it). register_push_token is a
          // security definer RPC that evicts any other owner's row for this token first -- see the
          // migration's own doc comment. #264's reregisterPushToken self-heal (below) calls this
          // same RPC.
          console.log("[push] toggleNotifications: calling register_push_token...");
          const { error: rpcError } = await withTimeout(
            client.rpc("register_push_token", { p_platform: PLATFORM, p_token: token }),
            STEP_TIMEOUT_MS,
            "register_push_token",
          );
          if (rpcError) {
            // #272 item C: this used to fall through to `return { error: null }` below, so a
            // PGRST202 (migration not applied) or a "must be signed in" raise left the switch ON
            // with no token registered -- silently dead alerts. #158/#165/#167 convention: revert
            // the optimistic flip and surface it instead of claiming success.
            //
            // Known ceiling: this reverts only the local `notificationsEnabled` state, not the
            // profiles.update(notifications_enabled: next) write a few lines up, which already
            // succeeded -- the server is left with notifications_enabled=true while this device's
            // switch shows off. That's a deliberate no-op, not an oversight: the flag is the user's
            // stored cross-device preference (same reasoning as signOut()'s own doc comment on why
            // it never flips this flag), and refresh()'s self-heal (this hook's own mount/focus
            // effect) will pick `true` back up on the very next focus and retry registration --
            // exactly the repair #264 built. A server-side rollback here would be more surface for
            // no real gain and would fight that self-heal instead of relying on it.
            console.warn("[push] toggleNotifications: register_push_token failed", rpcError);
            setNotificationsEnabled(!next);
            return { error: "Couldn't register this device" };
          }
        }
      } else {
        // #272 item B: favoriteFoodAlerts's own refresh() (mount/focus) can have a self-heal
        // re-registration in flight -- a real network round trip -- when the user flips this
        // switch off. Without waiting for it here, that self-heal's register_push_token can land
        // AFTER this delete, resurrecting the row this toggle-off just removed (check-favorited-
        // foods gates on notifications_enabled, already false here, but send-ping-push deliberately
        // doesn't -- see its own doc comment -- so ping pushes would keep arriving). Same bounded
        // await-before-delete ordering as signOut() (auth.ts) uses for the same race.
        const heal = pendingSelfHeal();
        if (heal) {
          try {
            await withTimeout(heal, STEP_TIMEOUT_MS, "pendingSelfHeal (toggle off)");
          } catch (e) {
            console.warn("[push] toggleNotifications: waiting for an in-flight self-heal timed out or failed -- proceeding with toggle-off anyway", e);
          }
        }
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

  return { session, notificationsEnabled, favoritesCount, needsPermission, toggle, refresh };
}
