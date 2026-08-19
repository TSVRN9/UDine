import { distinctLoggedDishes } from "./ranking.ts";
import { DINING_HALLS } from "./umassDining.ts";
import type { LogEntry } from "./types.ts";

/**
 * Device-local record of every distinct dish name this device has seen offered at each hall, across
 * all menu fetches — the denominator for hallCompletion below. Accumulates over time; a dish stays
 * "seen" once observed even if it later rotates off the menu, so recordSeen should be called with
 * every menu fetch's dish names, not just the latest snapshot. Mirrors LogStorage's interface style
 * (storage.ts) with a bulk getter (getAllSeenDishNames, like getAllEntries) — the shape hallCompletion
 * takes directly, since its only consumer (#92's You pane) needs all 4 halls at once, not one at a
 * time. Contract only here — implemented per-platform (mobile SQLite lands with #92). Nothing
 * implementing this interface may call a network API, per CLAUDE.md's data residency table.
 */
export interface SeenDishesStorage {
  recordSeen(hallTid: number, dishNames: string[]): Promise<void>;
  /** Every tracked hall's distinct seen dish names at once — the shape hallCompletion takes directly. */
  getAllSeenDishNames(): Promise<Map<number, string[]>>;
}

export class InMemorySeenDishesStorage implements SeenDishesStorage {
  private seen = new Map<number, Set<string>>();

  async recordSeen(hallTid: number, dishNames: string[]): Promise<void> {
    const set = this.seen.get(hallTid) ?? new Set<string>();
    for (const name of dishNames) set.add(name);
    this.seen.set(hallTid, set);
  }

  async getAllSeenDishNames(): Promise<Map<number, string[]>> {
    return new Map([...this.seen.entries()].map(([hallTid, names]) => [hallTid, [...names]]));
  }
}

export interface HallCompletion {
  hallTid: number;
  /** Distinct dishes logged at this hall that this device also recorded seeing offered — see
   * hallCompletion's doc comment for why a logged-but-never-seen dish is excluded. */
  loggedDistinct: number;
  /** Distinct dishes this device has ever seen this hall offer — the honest-by-construction
   * denominator: what THIS DEVICE has observed, not the hall's true full menu. */
  seenDistinct: number;
  /** loggedDistinct / seenDistinct as a whole-number percentage (0-100, rounded). 0 when seenDistinct
   * is 0, never NaN. */
  pct: number;
}

/**
 * Per-hall completion: how many distinct dishes at each hall this device has logged, out of how many
 * distinct dishes this device has ever seen that hall offer. Always returns all 4 DINING_HALLS (same
 * convention as ranking.ts's rankDiningHalls), even halls with nothing seen or logged yet.
 *
 * loggedDistinct only counts a logged dish if it's also present in `seenByHall` — a dish logged
 * before this device started seen-tracking (or logged on another device) can't count as completion
 * progress against a menu this device never observed, which keeps pct from exceeding 100. Reuses
 * ranking.ts's distinctLoggedDishes for de-duplicating the log so that identity logic isn't
 * reimplemented here.
 */
export function hallCompletion(seenByHall: Map<number, string[]>, logged: LogEntry[]): HallCompletion[] {
  const loggedByHall = new Map<number, Set<string>>();
  for (const d of distinctLoggedDishes(logged)) {
    const set = loggedByHall.get(d.hallTid) ?? new Set<string>();
    set.add(d.dishName);
    loggedByHall.set(d.hallTid, set);
  }

  return DINING_HALLS.map((hall) => {
    const seenSet = new Set(seenByHall.get(hall.tid) ?? []);
    const loggedSet = loggedByHall.get(hall.tid) ?? new Set<string>();
    const seenDistinct = seenSet.size;
    const loggedDistinct = [...loggedSet].filter((name) => seenSet.has(name)).length;
    const pct = seenDistinct === 0 ? 0 : Math.round((100 * loggedDistinct) / seenDistinct);
    return { hallTid: hall.tid, loggedDistinct, seenDistinct, pct };
  });
}
