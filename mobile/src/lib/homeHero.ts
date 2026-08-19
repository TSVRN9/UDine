import { currentMealPeriod, openStatus, type DiningHallHours, type MealPeriod, type OpenStatus, type RetailLocationHours } from "@udine/shared";

/**
 * The Home pane's mealtime hero, aggregated across all 4 commons for one "what's being served
 * right now" line. Four states, matching #90's spec:
 *  - "meal": at least one hall is actively serving a named meal period right now.
 *  - "open": at least one hall is open but none has a named meal period active (e.g. summer
 *    schedule, general-hours-only — see #98's KNOWN CONSUMER NOTE).
 *  - "closed": every hall is closed right now, but at least one has a known future opening
 *    today (e.g. before breakfast).
 *  - "closedForDay": every hall is closed and none has a known opening left today. Note:
 *    `openStatus` only ever resolves `opensAt` from *today's* windows (see hours.ts), so this
 *    state covers both "nothing published at all" (e.g. full summer closure) and "it's 10pm,
 *    the last window already closed" — both render the same "nothing open right now" copy,
 *    which is an acceptable simplification (no day-rollover lookahead) rather than a gap.
 */
export type HomeHero =
  | { kind: "meal"; period: MealPeriod; closesAt: Date }
  | { kind: "open"; closesAt: Date }
  | { kind: "closed"; opensAt: Date }
  | { kind: "closedForDay" };

const MEAL_ORDER: MealPeriod[] = ["breakfast", "lunch", "dinner"];

/** Derives the aggregate hero state from all halls' hours as of `now`. The meal period is a
 * function of the clock, not a vote across halls: scans breakfast → lunch → dinner in that
 * canonical order and takes the first one any open hall is currently serving, with `closesAt`
 * as the latest close among halls sharing that period (mirrors openStatus's own "latest close
 * wins" rule for overlapping windows). */
export function deriveHomeHero(halls: DiningHallHours[], now: Date): HomeHero {
  const perHall = halls.map((h) => ({ period: currentMealPeriod(h, now), status: openStatus(h, now) }));

  for (const period of MEAL_ORDER) {
    const serving = perHall.filter((h) => h.period === period && h.status.open);
    if (serving.length === 0) continue;
    let closesAt = (serving[0].status as { open: true; closesAt: Date }).closesAt;
    for (const h of serving) {
      const c = (h.status as { open: true; closesAt: Date }).closesAt;
      if (c > closesAt) closesAt = c;
    }
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

function formatTime(date: Date): string {
  let hour = date.getHours();
  const minute = date.getMinutes();
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** Big display title + subtitle line for the hero, per #90's canvas spec. */
export function formatHeroLine(hero: HomeHero): { title: string; subtitle: string } {
  switch (hero.kind) {
    case "meal":
      return { title: hero.period.toUpperCase(), subtitle: `served now · until ${formatTime(hero.closesAt)}` };
    case "open":
      return { title: "OPEN", subtitle: `served now · until ${formatTime(hero.closesAt)}` };
    case "closed":
      return { title: "CLOSED", subtitle: `opens at ${formatTime(hero.opensAt)}` };
    case "closedForDay":
      return { title: "CLOSED", subtitle: "nothing open right now" };
  }
}

/** Reuses shared's openStatus by wrapping a retail location's single published window as a
 * hall's "general" window — retail/café locations don't have meal-period breakdowns, just one
 * open/close window (or none, when the feed reports "Closed"). Keeps this mobile-only: no new
 * export needed from @udine/shared for a formatting concern that only the Home pane has. */
export function retailOpenStatus(loc: RetailLocationHours, now: Date): OpenStatus {
  return openStatus({ hallTid: -1, breakfast: null, lunch: null, dinner: null, latenight: null, general: loc.hours }, now);
}

/** OPEN/CLOSED chip text for a hall card or a café/market row, per #90's canvas spec (gold OPEN
 * chip with closes-time, muted CLOSED chip with opens-time or no time at all). */
export function formatLocationChip(status: OpenStatus): { open: boolean; text: string } {
  if (status.open) return { open: true, text: `OPEN · closes ${formatTime(status.closesAt)}` };
  if (status.opensAt) return { open: false, text: `CLOSED · opens ${formatTime(status.opensAt)}` };
  return { open: false, text: "CLOSED" };
}
