import { DINING_HALLS, GRAB_N_GO_TIDS, fetchMenu } from "@udine/shared";

import { saveCachedMenu } from "./menuHoursCache";

// Fire-and-forget warm of today's on-device menu cache at app launch, so it's more likely to
// already be populated before the user is standing in a dead zone. Never awaited by the caller
// (see _layout.tsx), so every per-tid failure is swallowed here -- one hall being down must not
// stop the rest, and this function itself must never reject.
export function prefetchTodaysMenus(date: Date = new Date()): void {
  const tids = [...DINING_HALLS.map((hall) => hall.tid), ...Object.values(GRAB_N_GO_TIDS)];
  for (const tid of tids) {
    fetchMenu(tid, date)
      .then((items) => saveCachedMenu(tid, date, items))
      .catch(() => {});
  }
}
