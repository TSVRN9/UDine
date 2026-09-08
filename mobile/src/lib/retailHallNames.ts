import { hallNameFor, hallNameForOrNull, type RetailLocationHours } from "@udine/shared";
import { syntheticHallTidForName } from "./cafeMenu";

/**
 * #243 bug A: shared's hallNameFor is correct to fall back to "Hall <tid>" for a genuinely
 * unresolvable tid (a stale/future value neither DINING_HALLS nor GRAB_N_GO_TIDS knows about) --
 * but a café/retail location (loggable since #219) has a real name the get_infov2 feed already
 * told us, it's just not in either of those two hardcoded tables. Rather than teach shared's pure
 * lookup about device-fetched retail data, this keeps a session-lifetime, in-memory tid->name map
 * fed by every hours feed this device sees (menuHoursCache.ts's fetchHoursAndCache on a live fetch,
 * getCachedHours on a cache hit -- see that file) -- so any screen that renders retail hours also
 * teaches this map their names.
 *
 * ponytail: not persisted, and read during render with no subscription -- a café label rendered
 * before this map has been taught that tid's name (e.g. YouPane's Today's Log, which the pager
 * mounts eagerly ALONGSIDE HomePane per index.tsx, not after it -- so YouPane's SQLite-backed log
 * can render before HomePane's network hours fetch resolves) still shows "Hall <tid>" until
 * something else triggers a re-render of that screen. Strictly better than main (which never
 * corrects at all), but not instant. Upgrade to a subscribable store (or hydrating from
 * getCachedHours() at a dedicated startup point ahead of both panes) if that gap proves real.
 */
let retailNames = new Map<number, string>();

export function recordRetailNames(retail: RetailLocationHours[]): void {
  for (const loc of retail) {
    // Café-screen unification review finding: a locationId-less café now logs for real (its
    // info-only state mounts PlateSheet same as any other), so it needs a real name recorded too --
    // keyed by the same synthetic per-name hallTid PlateSheet/the standing-menu waterfall use for
    // it (syntheticHallTidForName, cafeMenu.ts), not skipped the way it used to be.
    retailNames.set(loc.locationId ?? syntheticHallTidForName(loc.name), loc.name);
  }
}

/** hallNameFor, extended with the retail map above as a middle fallback before the generic
 * "Hall <tid>" -- real halls and Grab 'N Go stations resolve exactly as hallNameFor already did. */
export function hallOrRetailName(hallTid: number): string {
  return hallNameForOrNull(hallTid) ?? retailNames.get(hallTid) ?? hallNameFor(hallTid);
}

export function __resetRetailNamesForTest(): void {
  retailNames = new Map();
}
