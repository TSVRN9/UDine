import { DINING_HALLS, GRAB_N_GO_TIDS, fetchMenu } from "@udine/shared";

import { effectiveToday } from "./date";
import { stepDate } from "./hallMenuTabs";
import { fetchHoursAndCache, getCachedMenu, isMenuCacheFinal, saveCachedMenu } from "./menuHoursCache";

// The exact scope both the app-launch prefetch and the background-refresh task (backgroundTask.ts)
// warm: every dining hall + every Grab 'N Go stand, never retail/café (see the brief's Rationale --
// little dish-name overlap and retail menus barely change).
export function menuCacheTids(): number[] {
  return [...DINING_HALLS.map((hall) => hall.tid), ...Object.values(GRAB_N_GO_TIDS)];
}

// Owner decision 2 (brief): prefetch today + 2 days ahead, matching how far the hall screen's own
// date stepper lets a user browse.
const PREFETCH_DAY_OFFSETS = [0, 1, 2];

// A non-final copy under this age is skipped too -- it was itself a recent prefetch or a page
// view, not stale enough to be worth spending another request on. Only a copy that's both
// non-final AND old gets re-fetched; a final copy (owner's "this day already started" rule, see
// isMenuCacheFinal) is skipped regardless of age.
const MENU_PREFETCH_FRESH_MS = 6 * 60 * 60 * 1000; // ~6h

async function shouldSkipWarm(tid: number, date: Date): Promise<boolean> {
  const cached = await getCachedMenu(tid, date).catch(() => null);
  if (!cached) return false;
  if (isMenuCacheFinal(cached, date)) return true;
  return Date.now() - new Date(cached.fetchedAt).getTime() < MENU_PREFETCH_FRESH_MS;
}

// Fetches + saves the on-device menu cache for every tid in menuCacheTids(), for today + the next
// 2 days, plus the hours cache. Every per-tid/per-day failure (and the hours warm) is swallowed
// individually -- one hall or one day being down must not stop the rest -- so this never rejects.
// Shared by prefetchTodaysMenus (app launch, fire-and-forget) and backgroundTask.ts's registered
// task (periodic, awaited so the OS knows when the run finished).
export function warmMenuCache(date: Date = effectiveToday()): Promise<void> {
  const dates = PREFETCH_DAY_OFFSETS.map((offset) => stepDate(date, offset));
  const menuWork = dates.flatMap((d) =>
    menuCacheTids().map((tid) =>
      shouldSkipWarm(tid, d)
        .then((skip) => (skip ? undefined : fetchMenu(tid, d).then((items) => saveCachedMenu(tid, d, items))))
        .catch(() => {}),
    ),
  );
  return Promise.all([...menuWork, fetchHoursAndCache().catch(() => {})]).then(() => undefined);
}

// Fire-and-forget warm of today's on-device menu cache at app launch, so it's more likely to
// already be populated before the user is standing in a dead zone. Never awaited by the caller
// (see _layout.tsx); warmMenuCache never rejects, so this never throws either.
export function prefetchTodaysMenus(date: Date = effectiveToday()): void {
  warmMenuCache(date).catch(() => {});
}
