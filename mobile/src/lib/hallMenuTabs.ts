import {
  currentMealPeriod,
  MEAL_PERIODS,
  mealPeriodLabel,
  openStatus,
  type DiningHallHours,
  type HallMealPeriod,
  type MealPeriod,
  type NutritionFacts,
} from "@udine/shared";

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

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(date: Date): string {
  let hour = date.getHours();
  const minute = date.getMinutes();
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/**
 * The tab row's "being served now · until HH:MM" line (canvas spec, sits below the tabs). Per
 * #117: only renders when the selected day+meal is what the hall is ACTUALLY serving right now --
 * not just whenever a meal tab happens to be selected, and not for a past/future date stepped away
 * from today even if the clock-time would otherwise match.
 */
export function mealTabSubtitle(hours: DiningHallHours | undefined, selectedDate: Date, selectedMeal: HallMealPeriod, now: Date): string | null {
  if (!hours) return null;
  if (!isSameDay(selectedDate, now)) return null;
  if (currentMealPeriod(hours, now) !== selectedMeal) return null;
  const window = hours[selectedMeal];
  if (!window) return null; // defensive: currentMealPeriod matched this key, so shouldn't happen
  // Reuses shared's openStatus by wrapping the single meal window as a hall's "general" window,
  // same trick homeHero.ts's singleWindowStatus/retailOpenStatus use, to get *this window's* close
  // time rather than openStatus's hall-wide latest-close-among-all-open-windows answer.
  const status = openStatus({ hallTid: hours.hallTid, breakfast: null, lunch: null, dinner: null, latenight: null, general: window }, now);
  if (!status.open) return null;
  return `being served now · until ${formatTime(status.closesAt)}`;
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

/** Toggles one dish card's expanded state. Immutable -- returns a new Set, never mutates the one
 * passed in (React state). Cards expand independently (a Set of keys, not a single "the expanded
 * one"), matching the canvas's tap-any-card-to-expand-in-place behavior. */
export function toggleExpandedKey(expanded: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(expanded);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
