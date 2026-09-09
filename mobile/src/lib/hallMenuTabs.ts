import {
  currentMealPeriod,
  MEAL_PERIODS,
  mealPeriodLabel,
  type DiningHallHours,
  type HallMealPeriod,
  type MealPeriod,
  type NutritionFacts,
  type RetailLocationHours,
  type TimeWindow,
} from "@udine/shared";
import { findGrabNGoLocation } from "./grabStrip";

/** Meal tab order for the hall-menu header row (#117 canvas: Breakfast / Lunch / Dinner / Late).
 * Grab 'N Go is a 5th, separately-rendered tab that navigates away rather than selecting one of
 * these -- it isn't a MealPeriod on this hall's own menu. Sourced from shared's MEAL_PERIODS
 * (#144) rather than a second hardcoded list, so a future period added there (RAW_MEAL_PERIOD_KEYS)
 * shows up here automatically instead of silently diverging -- see #137/#141 for the web-side bug
 * this exact defect class caused. `readonly` because it's the same array shared owns, not a copy. */
export const MEAL_TABS: readonly HallMealPeriod[] = MEAL_PERIODS;

/** Tab label: same as shared's mealPeriodLabel, except this tab row is narrow enough that "Late
 * Night" gets truncated to "Late" (#117 canvas) -- an intentional per-call-site override, not a
 * fork of the title-casing logic itself, which still comes from shared. */
export function mealTabLabel(period: MealPeriod): string {
  if (period === "latenight") return "Late";
  return mealPeriodLabel(period);
}

/** Café-context override of mealTabLabel: an integrated/standing café's "allday" tab reads "Daily
 * Offerings" per the CafeMenuIntegrated artboard (#378), not shared's generic "All Day" --
 * mealPeriodLabel/mealTabLabel stay untouched since "All Day" is still correct for a real dining
 * hall's own all-day period elsewhere. `isRealHall` scopes the override to café rendering only. */
export function cafeMealTabLabel(period: MealPeriod, isRealHall: boolean): string {
  if (!isRealHall && period === "allday") return "Daily Offerings";
  return mealTabLabel(period);
}

/**
 * Whether [slug].tsx's current-meal auto-correction effect should actually fire `setSelectedMeal`
 * for a resolved `period` -- pulled out of that effect as a pure predicate so the guard's DECISION
 * is unit-testable without mounting the whole screen (see this file's own tests).
 *
 * The guard's real-world consequence -- whether an armed `mealTabInstantRef` leaks onto
 * MealTabPager's next commit -- is deliberately NOT covered by a wiring-level test through the full
 * screen. Confirmed by direct investigation (source-level logging, not just reasoning) while
 * reviewing this exact fix: react-native-reanimated's Jest mock (jest.config.js's
 * `^react-native-reanimated$` mapping) returns a fresh, non-memoized object from `useSharedValue` on
 * every render, so MealTabPager's commit `useEffect` -- keyed in part on `panePos`/`paneOpacityPos`
 * -- re-fires on EVERY re-render of the full screen for unrelated reasons (e.g. the hours fetch
 * itself resolving via `setHoursFeed`), not just on a genuine `activeIndex` change. That spurious
 * extra firing silently self-consumes any armed flag before a real leak can ever be observed end to
 * end, so a full-screen mounted test of this consequence would pass whether or not the guard above
 * is actually correct -- confirmed by writing exactly such a test, mutating the guard back to the
 * original bug shape, and watching the "regression" test still pass. This is a real gap in what
 * Jest can verify here, not a decision to skip testing; the mitigation is this predicate's own
 * thorough unit coverage plus the source-level reasoning in this comment, reviewed carefully in PR
 * review instead.
 *
 * Two guards, both load-bearing:
 * - `mealTabs.includes(period)`: `currentMealPeriod` can return "latenight", which a real hall's
 *   fixed MEAL_TABS may not include. Correcting to a period absent from `mealTabs` would reproduce
 *   the same stale-selection bug the café tab-derivation guards against elsewhere: tab-0 content
 *   renders with no pill highlighted. A period the hall has no tab for (closed, or outside
 *   MEAL_TABS) means the static default should stand.
 * - `period !== selectedMeal`: the common case is the static "lunch" default already matching the
 *   real current meal (opened during actual lunch) -- calling `setSelectedMeal` with the value it
 *   already holds is a same-value no-op React bails on, which would leave `mealTabInstantRef`
 *   armed with nothing to consume it, and it would wrongly snap the user's NEXT real swipe/tap
 *   instead of tweening it.
 */
export function shouldAutoCorrectMealTab(period: MealPeriod, selectedMeal: MealPeriod | "grab" | null, mealTabs: readonly MealPeriod[]): boolean {
  return mealTabs.includes(period) && period !== selectedMeal;
}

/** Steps a date by whole calendar days, preserving time-of-day. Returns a new Date -- never
 * mutates the one passed in (callers hold the previous selectedDate in state). */
export function stepDate(date: Date, deltaDays: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + deltaDays);
  return next;
}

/** Header date-stepper label, e.g. "Wed, Aug 19" (canvas spec). */
export function formatDateStepperLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// #180: mealTabSubtitle (the tab row's "being served now · until HH:MM" line) was removed here --
// serving windows now live ONLY in the hall-info bottom sheet (hallInfoHoursRows below), opened by
// tapping the title group. Its 4 tests in hallMenuTabs.test.ts moved with it (see that file's own
// #180 comment); the NOW-highlight behavior it covered is now asserted on hallInfoHoursRows instead.

/**
 * One row in the hall-info sheet's hours card (#180 canvas: "Hall info sheet (i)") -- breakfast,
 * lunch, dinner, late night in that order (MEAL_TABS/shared's MEAL_PERIODS), each flagged `isNow`
 * only for the hall's ACTUAL current meal period (get_infov2/hoursFeed only ever publishes TODAY's
 * hours, so unlike the retired mealTabSubtitle there's no separate "is this even today" check --
 * the data itself has no other day to be about).
 */
export interface HallHoursRow {
  period: MealPeriod | "general";
  label: string;
  window: TimeWindow | null;
  isNow: boolean;
}

/** #432: get_infov2 currently publishes only `general` hours for every hall (all 4 commons'
 * per-meal fields null, confirmed live 2026-09-09 -- same "Summer Hours" shape referenced above,
 * just hitting semester dates too). The normal 3-row breakfast/lunch/dinner layout would render
 * three "not served here" rows even though the hall is genuinely open per `general` -- so when
 * every per-meal window is null AND `general` is published, collapse to a single row showing the
 * real `general` window instead. Halls that publish any real per-meal data keep the normal rows
 * unchanged (this only fires on the all-null case). */
export function hallInfoHoursRows(hours: DiningHallHours, now: Date): HallHoursRow[] {
  if (!hours.breakfast && !hours.lunch && !hours.dinner && hours.general) {
    return [{ period: "general", label: "Hours", window: hours.general, isNow: false }];
  }
  const current = currentMealPeriod(hours, now);
  return MEAL_TABS.map((period) => ({
    period,
    label: mealPeriodLabel(period),
    window: hours[period],
    // `hours[period] !== null` too, not just `current === period`: currentMealPeriod can now match
    // via shared's standard-schedule fallback (no real per-meal data published, e.g. summer hours)
    // -- this sheet only ever shows real published windows (`hallInfoWindowText`'s "not served here"
    // above), so a row with no window must never be flagged as the current one.
    isNow: current === period && hours[period] !== null,
  }));
}

/** Hours-row time text: the feed's own "H:MM AM/PM" strings straight through (already the display
 * format, see get_infov2's confirmed shape) for a real window, or the spec's exact absent-window
 * copy otherwise -- reused verbatim for both Late Night (mapInfoV2 never publishes it, see hours.ts)
 * and Grab 'N Go (the feed reports "Closed" for all 4 halls' Grab 'N Go entries today, per #180's
 * live capture), rather than inventing a second string for the same "nothing served" meaning. */
export function hallInfoWindowText(window: TimeWindow | null): string {
  return window ? `${window.openTime} - ${window.closeTime}` : "not served here";
}

/** Finds this hall's Grab 'N Go window among get_infov2's retail locations for the sheet's Grab 'N
 * Go hours row -- reuses grabStrip.ts's own findGrabNGoLocation (the Home strip's lookup) rather
 * than a second hall-name-matching implementation; that function's own doc explains why a loose
 * "starts with hall name + /grab/i" match is required (a live capture found a smart-apostrophe
 * "Grab ‘N Go" spelling a literal string match would miss). */
export function hallInfoGrabNGoWindow(retail: RetailLocationHours[], hallName: string): TimeWindow | null {
  return findGrabNGoLocation(retail, hallName)?.hours ?? null;
}

/** Expanded-card summary line, e.g. "Per serving 6 oz · 160 cal · 27g protein · 0g carbs · 5g fat"
 * (canvas spec). Macros round to whole grams; calories already come through as a whole number from
 * the feed. */
export function formatServingSummary(nutrition: NutritionFacts): string {
  const protein = Math.round(nutrition.proteinG);
  const carbs = Math.round(nutrition.totalCarbG);
  const fat = Math.round(nutrition.totalFatG);
  return `Per serving ${nutrition.servingSize} · ${Math.round(nutrition.calories)} cal · ${protein}g protein · ${carbs}g carbs · ${fat}g fat`;
}

/** DIRECTIONS row target: a maps deep link built from get_infov2's validated "lat,long" (shared's
 * parseMapAddress already screened the raw value at the trust boundary -- see hours.ts's own doc --
 * so this only has to format it, not re-validate). `null` in -> `null` out, so the sheet can omit
 * the DIRECTIONS affordance entirely for the rare hall missing a coordinate rather than handing
 * Linking.openURL a broken link. https://maps.google.com/?q=lat,long opens the OS's own maps app on
 * both platforms (no react-native-maps/deep-link-per-platform dependency for one outbound link). */
export function directionsUrl(mapAddress: string | null | undefined): string | null {
  if (!mapAddress) return null;
  return `https://maps.google.com/?q=${encodeURIComponent(mapAddress)}`;
}

/** Sheet's events-row empty-state copy, verbatim per the #180 canvas spec. Not derivable any other
 * way -- see hallInfoEvents' own doc for why this is the only hall-specific thing about that row. */
export function hallInfoEventsEmptyCopy(hallName: string): string {
  return `No events at ${hallName} this week`;
}

/**
 * Café-screen QA fix (bug 1): whether the plate bar's "still loading" empty-state should show for
 * the CURRENTLY selected tab -- pulled out as a pure predicate so the café "info" case is
 * unit-testable without mounting the whole screen. [slug].tsx's original inline formula treated
 * `selectedMeal === null` as "still loading" for every café, real hall alike -- correct for a real
 * hall (its 4 tabs are always the same MEAL_TABS, so a null selectedMeal only ever means the
 * current-meal-period effect hasn't landed yet) and for an "integrated"/"standing" café (mealTabs
 * resolves and the pick-first-tab effect fires selectedMeal moments later) -- but WRONG for an
 * "info" café: it has no mealTabs at all (see mealTabs' own doc comment), so the effect that would
 * ever set selectedMeal never runs, and it stays null forever. That made an info-only café's plate
 * bar read as PERMANENTLY loading -- disabled LOG button, "add dishes once the menu loads" copy
 * that can never come true (the whole point of this ticket: it should read and work like the normal
 * "search for something not on the menu" empty state instead, same as it already does for a real
 * hall whose menu genuinely has zero matching dishes).
 */
export function isCurrentTabLoading(params: {
  selectedMeal: MealPeriod | "grab" | null;
  isRealHall: boolean;
  hasItems: boolean;
  hasGrabItems: boolean;
  cafeStateKind: "integrated" | "standing" | "info" | null;
}): boolean {
  const { selectedMeal, isRealHall, hasItems, hasGrabItems, cafeStateKind } = params;
  if (selectedMeal === "grab") return !hasGrabItems;
  if (isRealHall) return !hasItems || selectedMeal === null;
  if (cafeStateKind === null) return true; // waterfall still resolving (ajax in flight, or catalog not yet read)
  if (cafeStateKind === "info") return false; // no tabs to ever select -- never "loading" on that account
  return selectedMeal === null; // integrated/standing: brief moment before the pick-first-tab effect lands
}

/** Toggles one dish card's expanded state. Immutable -- returns a new Set, never mutates the one
 * passed in (React state). Cards expand independently (a Set of keys, not a single "the expanded
 * one"), matching the canvas's tap-any-card-to-expand-in-place behavior. */
export function toggleExpandedKey(expanded: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(expanded);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
