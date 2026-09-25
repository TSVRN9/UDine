import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { hallNameFor, matchFavoritedDishes } from "@udine/shared";

import { effectiveToday } from "./date";
import { menuCacheTids, warmMenuCache } from "./menuPrefetch";
import { getCachedMenu } from "./menuHoursCache";
import { SqliteFavoritesStorage } from "./favoritesStorage";
import { claimSighting } from "./sightingDedup";
import { supabase } from "./supabase";

// One shared task, not one per feature (see docs/briefs/eager-caching-and-notifications.md's
// Rationale) -- expo-background-task's own docs warn that multiple registered tasks share a single
// worker and the LAST registered task's minimum interval wins, so a second task would silently
// undo this one's. This executor also runs signed-out favorited-food notification matching, below;
// it must not register a second task.
export const BACKGROUND_TASK_NAME = "udine-menu-cache-refresh";

/**
 * Signed-out-only favorited-dish local notification match (docs/briefs/eager-caching-and-
 * notifications.md task 3's Rationale). A signed-in user already gets reliable push via the
 * server's check-favorited-foods pipeline, independent of whether this task ever runs -- re-running
 * the same match client-side for them too would risk a double notification for the same sighting,
 * with no dedup coordinated between the two independent systems. getSession() (not a new auth
 * helper) is the same signed-in check auth.ts's own signOut() already uses.
 *
 * Reads back menuHoursCache's just-written entries (via getCachedMenu, keyed same as
 * warmMenuCache's own saveCachedMenu calls above) rather than threading fetch results through
 * warmMenuCache's return value -- keeps warmMenuCache's Promise<void> contract (menuPrefetch.ts's
 * fire-and-forget app-launch caller) untouched.
 *
 * Wrapped in try/catch, not just individual `.catch(() => {})`s: a local SQLite failure (favorites,
 * dedup) or a scheduleNotificationAsync rejection must degrade silently the same way a per-tid menu
 * fetch failure does (see the brief's acceptance criteria) -- never throw out of the registered task.
 *
 * shared/src/umassDining.ts:187's data-dish-name fallback (empty/missing attribute -> the <a> tag's
 * own inner text) is a pre-existing divergence from the server's extractDishMealMap, which has no
 * such fallback -- flagged in PR #485's review, not fixed here (out of this task's file list). It
 * doesn't corrupt matching/dedup here though: whatever name parseCategoryItems assigns a dish is the
 * SAME name the user favorited it under (both went through the one client-side parser), and it's the
 * same name every re-fetch of the same still-unchanged HTML produces, so the dedup key stays stable.
 * It only means a signed-out device's local match can, in that fallback case, diverge from what the
 * server-side (signed-in-only) pipeline would have matched -- moot here since the two pipelines
 * never run for the same user (see the gate above).
 *
 * ponytail: no OS notification-permission check before claiming a sighting. Nothing in this repo
 * currently requests POST_NOTIFICATIONS/UNUserNotificationCenter permission for a signed-out device,
 * so on a platform that gates delivery on it (Android 13+) an unpermitted device's matches still get
 * claimed here even though scheduleNotificationAsync's result is never actually seen -- silently
 * dropped, not retried, since the dedup entry is already written. Claim-before-notify (not the
 * reverse) is still the right call: it mirrors check-favorited-foods/index.ts's own upsert-before-
 * push order, and a dropped notification is a smaller failure than a duplicate one. Upgrade path:
 * an early `if (!(await Notifications.getPermissionsAsync()).granted) return;` before the loop,
 * once this repo has a signed-out permission-request flow to pair it with.
 */
async function notifySignedOutFavoriteMatches(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) return;

    const date = effectiveToday();
    const cached = await Promise.all(menuCacheTids().map((tid) => getCachedMenu(tid, date)));
    const items = cached.flatMap((entry) => entry?.items ?? []);

    const favorites = await new SqliteFavoritesStorage().getFavorites();
    const matches = matchFavoritedDishes(favorites, items);

    for (const match of matches) {
      const isNewSighting = await claimSighting(match.dishName, match.hallTid, match.date);
      if (!isNewSighting) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${match.dishName} is at ${hallNameFor(match.hallTid)} today`,
          body: "A favorite of yours is on today's menu.",
        },
        trigger: null,
      });
    }
  } catch (e) {
    console.warn("[backgroundTask] signed-out favorite match failed", e);
  }
}

// TaskManager.defineTask must be called in the JS bundle's global scope, not inside a React
// lifecycle -- on a background-only relaunch (Android HeadlessJS, iOS BGTaskScheduler) this module
// is loaded and the task run without any component ever mounting. Both steps below swallow their
// own failures (warmMenuCache per-tid, notifySignedOutFavoriteMatches as a whole), so this
// executor's own promise never rejects and always reports Success once both finish.
TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  await warmMenuCache();
  await notifySignedOutFavoriteMatches();
  return BackgroundTask.BackgroundTaskResult.Success;
});

// Called once at app launch (see _layout.tsx). registerTaskAsync is itself idempotent -- a no-op
// if the task is already registered -- so this is safe to call on every cold start, not just the
// first.
export function registerBackgroundTask(): Promise<void> {
  return BackgroundTask.registerTaskAsync(BACKGROUND_TASK_NAME, {
    // Android's WorkManager floor is ~15 minutes; iOS's BGTaskScheduler ignores this and schedules
    // at its own discretion with no guaranteed timing (see the brief's Rationale). Best-effort on
    // both -- never the only path to a warm cache, prefetchTodaysMenus still runs at app launch.
    minimumInterval: 15,
  });
}
