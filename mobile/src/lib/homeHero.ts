import { currentMealPeriod, effectiveMealWindow, formatTimeOfDay, MEAL_PERIODS, mealPeriodLabel, openStatus, type DiningHallHours, type MealPeriod, type OpenStatus, type RetailLocationHours, type TimeWindow } from "@udine/shared";

/**
 * The Home pane's mealtime hero, aggregated across all 4 commons for one "what's being served
 * right now" line. Four states:
 *  - "meal": at least one hall is actively serving a named meal period right now.
 *  - "open": at least one hall is open but none has a named meal period active (e.g. summer
 *    schedule, general-hours-only).
 *  - "closed": every hall is closed right now, but at least one has a known future opening
 *    today (e.g. before breakfast).
 *  - "closedForDay": every hall is closed and none has a known opening left today. `openStatus`
 *    only ever resolves `opensAt` from *today's* windows, so this state covers both "nothing
 *    published at all" and "it's 10pm, the last window already closed" — both render the same
 *    "nothing open right now" copy, an acceptable simplification rather than a gap.
 */
export type HomeHero =
  | { kind: "meal"; period: MealPeriod; closesAt: Date }
  | { kind: "open"; closesAt: Date }
  | { kind: "closed"; opensAt: Date }
  | { kind: "closedForDay" };

// Live get_infov2 data never populates latenight (always null), but currentMealPeriod/openStatus
// both handle it generically for a future data source -- this scan order must too, or a populated
// latenight window would silently fall into the "open, no named meal" bucket instead of getting its
// own hero line. Scans shared's MEAL_PERIODS directly rather than a second hardcoded copy of that
// order.

/** Derives the aggregate hero state from all halls' hours as of `now`. The meal period is a
 * function of the clock, not a vote across halls: scans breakfast → lunch → dinner → latenight in
 * that canonical order and takes the first one any open hall is currently serving, with `closesAt`
 * as the latest close among halls sharing that period -- each hall's own close for *that meal
 * window specifically*, not openStatus's hall-wide close (which would fold in general hours or any
 * other window also open right now). */
export function deriveHomeHero(halls: DiningHallHours[], now: Date): HomeHero {
  const perHall = halls.map((h) => ({ hall: h, period: currentMealPeriod(h, now), status: openStatus(h, now) }));

  for (const period of MEAL_PERIODS) {
    const serving = perHall.filter((h) => h.period === period && h.status.open);
    if (serving.length === 0) continue;
    // closesAt must come from the serving halls' own current-meal window, not from openStatus's
    // hall-wide closesAt -- openStatus takes the latest close across ALL currently-open windows
    // (general hours included), so a hall with both general hours and a narrower meal window would
    // otherwise report the meal as open past its own window's end.
    let closesAt: Date | null = null;
    for (const h of serving) {
      const window = effectiveMealWindow(h.hall, period, now);
      if (!window) continue; // currentMealPeriod matched this key, so this shouldn't happen
      const mealStatus = singleWindowStatus(window, now);
      if (mealStatus.open && (closesAt === null || mealStatus.closesAt > closesAt)) closesAt = mealStatus.closesAt;
    }
    if (closesAt === null) continue; // defensive: no resolvable window, fall through to "open"
    return { kind: "meal", period, closesAt };
  }

  const open = perHall.filter((h) => h.status.open);
  if (open.length > 0) {
    let closesAt = (open[0].status as { open: true; closesAt: Date }).closesAt;
    for (const h of open) {
      const c = (h.status as { open: true; closesAt: Date }).closesAt;
      if (c > closesAt) closesAt = c;
    }
    return { kind: "open", closesAt };
  }

  const opensAts = perHall
    .map((h) => (!h.status.open ? h.status.opensAt : null))
    .filter((d): d is Date => d !== null);
  if (opensAts.length === 0) return { kind: "closedForDay" };
  let opensAt = opensAts[0];
  for (const d of opensAts) if (d < opensAt) opensAt = d;
  return { kind: "closed", opensAt };
}

// Re-exported (not a second implementation) so grabStrip.ts (Home split-card Grab 'N Go strip) can
// keep importing formatTime from here -- shared's hours.ts owns the actual H:MM AM/PM logic now
// (formatTimeOfDay, the inverse of its own parseTimeOfDay), reused verbatim instead of a
// byte-for-byte duplicate.
export const formatTime = formatTimeOfDay;

/** Offline-line copy on Home ("updated 7:12 AM"-style) -- the cached feed's own fetchedAt, not
 * `now`, so it genuinely reflects when the data was last live rather than claiming freshness it
 * doesn't have. */
export function offlineUpdatedLine(fetchedAt: Date): string {
  return `updated ${formatTime(fetchedAt)}`;
}

/** Big display title + subtitle line for the hero. */
export function formatHeroLine(hero: HomeHero): { title: string; subtitle: string } {
  switch (hero.kind) {
    case "meal":
      // mealPeriodLabel(...).toUpperCase(), not hero.period.toUpperCase() -- the latter would
      // render latenight as "LATENIGHT" instead of "LATE NIGHT".
      return { title: mealPeriodLabel(hero.period).toUpperCase(), subtitle: `served now · until ${formatTime(hero.closesAt)}` };
    case "open":
      return { title: "OPEN", subtitle: `served now · until ${formatTime(hero.closesAt)}` };
    case "closed":
      return { title: "CLOSED", subtitle: `opens at ${formatTime(hero.opensAt)}` };
    case "closedForDay":
      return { title: "CLOSED", subtitle: "nothing open right now" };
  }
}

/** Resolves a single time window's own open/close status, ignoring every other window on the hall
 * -- reused by deriveHomeHero to get a meal period's own closesAt instead of openStatus's hall-wide
 * "latest close among all currently-open windows" answer. Same wrapping trick as retailOpenStatus
 * below. */
function singleWindowStatus(window: TimeWindow, now: Date): OpenStatus {
  return openStatus({ hallTid: -1, breakfast: null, lunch: null, dinner: null, latenight: null, general: window }, now);
}

/** Hall-menu header subtitle per the canvas ("Lunch · being served now · until 2:30 PM"): the
 * hall's own current meal period when one is active, its plain open/closed status otherwise. */
export function hallHeaderSubtitle(hours: DiningHallHours, now: Date): string {
  const period = currentMealPeriod(hours, now);
  const status = openStatus(hours, now);
  if (status.open && period !== "closed") {
    const window = effectiveMealWindow(hours, period, now);
    const mealStatus = window ? singleWindowStatus(window, now) : status;
    const closesAt = mealStatus.open ? mealStatus.closesAt : status.closesAt;
    const label = mealPeriodLabel(period);
    return `${label} · being served now · until ${formatTime(closesAt)}`;
  }
  if (status.open) return `Open · until ${formatTime(status.closesAt)}`;
  if (status.opensAt) return `Closed · opens ${formatTime(status.opensAt)}`;
  return "Closed today";
}

/** Reuses shared's openStatus by wrapping a retail location's single published window as a
 * hall's "general" window — retail/café locations don't have meal-period breakdowns, just one
 * open/close window (or none, when the feed reports "Closed"). Keeps this mobile-only: no new
 * export needed from @udine/shared for a formatting concern that only the Home pane has. */
export function retailOpenStatus(loc: RetailLocationHours, now: Date): OpenStatus {
  return openStatus({ hallTid: -1, breakfast: null, lunch: null, dinner: null, latenight: null, general: loc.hours }, now);
}

/** OPEN/CLOSED chip text for a hall card or a café/market row (gold OPEN chip with closes-time,
 * muted CLOSED chip with opens-time or no time at all). */
export function formatLocationChip(status: OpenStatus): { open: boolean; text: string } {
  if (status.open) return { open: true, text: `OPEN · closes ${formatTime(status.closesAt)}` };
  if (status.opensAt) return { open: false, text: `CLOSED · opens ${formatTime(status.opensAt)}` };
  return { open: false, text: "CLOSED" };
}
