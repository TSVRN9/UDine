import { DINING_HALLS, GRAB_N_GO_TIDS, fetchMenu } from "@udine/shared";

import { saveCachedMenu } from "./menuHoursCache";

// The exact scope both the app-launch prefetch and the background-refresh task (backgroundTask.ts)
// warm: every dining hall + every Grab 'N Go stand, never retail/café (see the brief's Rationale --
// little dish-name overlap and retail menus barely change).
export function menuCacheTids(): number[] {
  return [...DINING_HALLS.map((hall) => hall.tid), ...Object.values(GRAB_N_GO_TIDS)];
}

// Fetches + saves today's on-device menu cache for every tid in menuCacheTids(). Every per-tid
// failure is swallowed individually -- one hall being down must not stop the rest -- so this never
// rejects. Shared by prefetchTodaysMenus (app launch, fire-and-forget) and backgroundTask.ts's
// registered task (periodic, awaited so the OS knows when the run finished).
export function warmMenuCache(date: Date = new Date()): Promise<void> {
  return Promise.all(
    menuCacheTids().map((tid) =>
      fetchMenu(tid, date)
        .then((items) => saveCachedMenu(tid, date, items))
        .catch(() => {}),
    ),
  ).then(() => undefined);
}

// Fire-and-forget warm of today's on-device menu cache at app launch, so it's more likely to
// already be populated before the user is standing in a dead zone. Never awaited by the caller
// (see _layout.tsx); warmMenuCache never rejects, so this never throws either.
export function prefetchTodaysMenus(date: Date = new Date()): void {
  warmMenuCache(date).catch(() => {});
}
