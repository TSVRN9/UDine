import type { MealPeriod, MenuItem, OpenStatus, RetailLocationHours } from "@udine/shared";
import { formatTime } from "./homeHero";

/**
 * #177's runtime model, decided by investigation (issue body): probe `fetchMenu(locationId, today)`
 * at tap time, never precompute a tier -- the foodpro set shifts seasonally. This is the pure
 * decision the probe result maps to; the caller (cafe/[name].tsx) owns actually calling fetchMenu
 * and waiting for it. `locationId === undefined` short-circuits to "sheet" without ever calling
 * fetchMenu at all -- get_infov2 sometimes omits location_id (hours.ts's mapInfoV2 degrades it to
 * undefined rather than throwing), and there's no tid to fetch with in that case.
 */
export type CafeTapTarget = { kind: "menu" } | { kind: "sheet" };

export function cafeTapTarget(locationId: number | undefined, items: MenuItem[]): CafeTapTarget {
  if (locationId === undefined) return { kind: "sheet" };
  return items.length > 0 ? { kind: "menu" } : { kind: "sheet" };
}

/**
 * Meal tabs for a café's menu screen: derived from what the fetched items actually carry, in
 * first-seen order -- NOT hallMenuTabs.ts's fixed MEAL_TABS (breakfast/lunch/dinner/latenight),
 * which would silently drop a café-only period like "allday" ("daily offerings", #175) or
 * "grabngo" ever showing up as a tab, since a hall's selectedMeal can never equal either of those
 * (see types.ts's MealPeriod/HallMealPeriod split). Per the issue: "meal tabs only for periods the
 * café actually has."
 */
export function deriveCafeMealTabs(items: MenuItem[]): MealPeriod[] {
  const seen: MealPeriod[] = [];
  for (const item of items) {
    if (!seen.includes(item.mealPeriod)) seen.push(item.mealPeriod);
  }
  return seen;
}

/** Fallback-sheet status pill copy, verbatim per the styling spec ("OPEN · TIL 6 PM" / "CLOSED") --
 * distinct from Home's row chip (formatLocationChip's "OPEN · closes 6:00 PM"), which this issue
 * doesn't touch. */
export function cafeStatusPillText(status: OpenStatus): string {
  return status.open ? `OPEN · TIL ${formatTime(status.closesAt)}` : "CLOSED";
}

/**
 * Google Maps deep link from get_infov2's raw "lat,long" mapAddress -- null for anything that
 * isn't two parseable numbers, so a degenerate value (babyBerk's literal "," -- see CLAUDE.md and
 * hours.test.ts) hides the DIRECTIONS action instead of opening a bogus/blank maps query.
 */
export function directionsUrl(mapAddress: string | undefined): string | null {
  if (!mapAddress) return null;
  const parts = mapAddress.split(",");
  if (parts.length !== 2) return null;
  const lat = Number.parseFloat(parts[0]);
  const lng = Number.parseFloat(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://maps.google.com/?q=${lat},${lng}`;
}

/**
 * Which of the three *_menu fields backs the fallback sheet's standing-menu card. Real captures
 * (#176's hours.test.ts fixtures) only ever populate exactly one of the three at a time, so this
 * order (breakfast, then lunch, then dinner) is documented for the hypothetical case of more than
 * one being set, not something observed live.
 */
export function pickCafeMenuHtml(loc: Pick<RetailLocationHours, "breakfastMenu" | "lunchMenu" | "dinnerMenu">): string | null {
  return loc.breakfastMenu ?? loc.lunchMenu ?? loc.dinnerMenu ?? null;
}
