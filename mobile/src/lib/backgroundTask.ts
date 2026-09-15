import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import { warmMenuCache } from "./menuPrefetch";

// One shared task, not one per feature (see docs/briefs/eager-caching-and-notifications.md's
// Rationale) -- expo-background-task's own docs warn that multiple registered tasks share a single
// worker and the LAST registered task's minimum interval wins, so a second task would silently
// undo this one's. A later brief task extends this same executor with signed-out favorited-food
// notification matching; it must not register a second task.
export const BACKGROUND_TASK_NAME = "udine-menu-cache-refresh";

// TaskManager.defineTask must be called in the JS bundle's global scope, not inside a React
// lifecycle -- on a background-only relaunch (Android HeadlessJS, iOS BGTaskScheduler) this module
// is loaded and the task run without any component ever mounting. warmMenuCache() already swallows
// every per-tid fetch failure (see menuPrefetch.ts), so this executor's own promise never rejects
// and always reports Success once the warm finishes.
TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  await warmMenuCache();
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
