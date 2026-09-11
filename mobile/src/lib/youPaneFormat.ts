import {
  hallNameForOrNull,
  MEAL_PERIODS,
  mealPeriodLabel,
  rankFoods,
  scoreOutOfTen,
  type HallCompletion,
  type HallMealPeriod,
  type LogEntry,
  type RankedDish,
  type RankedFood,
} from "@udine/shared";
import { hallOrRetailName } from "./retailHallNames";

/**
 * shared's HallCompletion.pct rounds half-up (Math.round), so e.g. 199/200 seen dishes logged reads
 * back as pct 100 even though one dish is still unlogged. Recomputed from the raw counts with
 * Math.floor instead — feeds both the bar's fill width and its numeric label, so "100%" only ever
 * appears once loggedDistinct === seenDistinct.
 */
export function displayCompletionPct(c: Pick<HallCompletion, "loggedDistinct" | "seenDistinct">): number {
  return c.seenDistinct === 0 ? 0 : Math.floor((100 * c.loggedDistinct) / c.seenDistinct);
}

/** Gold for every food tied at the top score, maroon otherwise — canvas spec. */
export function pillTone(score: number, maxScore: number): "gold" | "maroon" {
  return score === maxScore ? "gold" : "maroon";
}

/**
 * RankedFood scores are cross-hall (identity by dishName alone — see docs/adr/0001), but the canvas
 * shows a hall label next to each top food. Derived presentationally, not part of the score: the
 * highest-rated per-hall RankedDish sharing that name, or (if this device never compared that dish
 * at any hall) the hall of the most recent log entry for that dish name. Null if neither source has it.
 */
export function deriveTopFoodHall(dishName: string, rankedDishes: RankedDish[], logEntries: LogEntry[]): number | null {
  const candidates = rankedDishes.filter((d) => d.dishName === dishName);
  if (candidates.length > 0) {
    return candidates.reduce((best, d) => (d.rating > best.rating ? d : best)).hallTid;
  }
  const logged = logEntries
    .filter((e) => e.source.type === "umass-menu" && e.source.dishName === dishName)
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  const mostRecent = logged[0];
  return mostRecent?.source.type === "umass-menu" ? mostRecent.source.hallTid : null;
}

export interface TopFoodDisplay {
  dishName: string;
  score: number;
  hallName: string | null;
  tone: "gold" | "maroon";
}

/**
 * YOUR TOP FOODS display list: highest-rated foods first, capped at `limit`, each with its 0-10
 * pill score, presentational hall label (deriveTopFoodHall), and pill tone. Foods below
 * scoreOutOfTen's MIN_COMPARISONS_FOR_SCORE gate are excluded — when every rankedFood is below that
 * gate, this returns [] even though rankedFoods isn't empty.
 */
export function buildTopFoods(rankedFoods: RankedFood[], rankedDishes: RankedDish[], logEntries: LogEntry[], limit = 5): TopFoodDisplay[] {
  const scores = scoreOutOfTen(rankedFoods);
  // rankFoods already orders by rating desc, and scoreOutOfTen is monotonic with rating, so filtering
  // preserves score order without a second sort.
  const qualifying = rankFoods(rankedFoods)
    .filter((f) => scores.has(f.dishName))
    .slice(0, limit);
  if (qualifying.length === 0) return [];

  const maxScore = Math.max(...qualifying.map((f) => scores.get(f.dishName)!));
  return qualifying.map((f) => {
    const score = scores.get(f.dishName)!;
    const hallTid = deriveTopFoodHall(f.dishName, rankedDishes, logEntries);
    const hallName = hallNameForOrNull(hallTid);
    return { dishName: f.dishName, score, hallName, tone: pillTone(score, maxScore) };
  });
}

/** The dish/product name for a log entry, regardless of source: the menu dish name for an
 * on-campus entry, the OpenFoodFacts product name for an off-menu (barcode) one. Consolidated onto
 * this one export so other call sites import it instead of re-deriving the same ternary. */
export function entryDishName(entry: LogEntry): string {
  return entry.source.type === "umass-menu" ? entry.source.dishName : entry.source.productName;
}

/** Single-line item text per the canvas: "<dish> × <qty> · <hall>", qty omitted when it's 1, hall
 * omitted for off-menu (barcode) entries that don't have one. */
export function logItemLine(entry: LogEntry): string {
  const name = entryDishName(entry);
  const qty = entry.servings !== 1 ? ` × ${entry.servings}` : "";
  const hall = entry.source.type === "umass-menu" ? ` · ${hallOrRetailName(entry.source.hallTid)}` : "";
  return `${name}${qty}${hall}`;
}

// --- Today's Log meal grouping ------------------------------------------------------------

// Re-exported so existing consumers (logsFormat.ts) keep importing this from here. Typed as
// HallMealPeriod, not the wider MealPeriod: these are fixed local-clock buckets that can never
// hold a retail-only period ("allday"/"grabngo").
export type { HallMealPeriod };

/**
 * Canonical, contiguous local-clock windows (minutes since local midnight) a log entry's time gets
 * bucketed against -- not the live per-hall hours from hours.ts (`currentMealPeriod` needs a fetched
 * `DiningHallHours` for a specific hall/day, which off-menu barcode entries don't have and a
 * device-local log spanning past days can't retroactively re-fetch). These windows cover the full
 * 24h day back-to-back (late night's 9 PM start runs through breakfast's 5 AM start the next
 * morning), so every entry falls inside exactly one enclosing period by construction. Sorted
 * ascending; the last boundary <= the entry's minute-of-day wins, with "latenight" as the default
 * before breakfast's 5:00 AM start. This only decides which meal GROUP an entry lands in -- which
 * DAY's card it renders on is a separate decision made upstream by the caller's own date filter.
 *
 * Deliberately not consolidated onto shared's MEAL_PERIODS, unlike groupEntriesByMeal's group
 * order/labels below: this table is the gate on which periods can receive entries at all, and
 * picking a window for a new period is a product decision shared's ordered-name list can't answer.
 */
export const MEAL_BOUNDARIES: { period: HallMealPeriod; startMinutes: number }[] = [
  { period: "breakfast", startMinutes: 5 * 60 }, // 5:00 AM
  { period: "lunch", startMinutes: 10 * 60 + 30 }, // 10:30 AM
  { period: "dinner", startMinutes: 14 * 60 }, // 2:00 PM
  { period: "latenight", startMinutes: 21 * 60 }, // 9:00 PM
];

/** Which meal period a LogEntry.loggedAt timestamp falls into, by local clock time. `new Date()`
 * parses a bare (no "Z"/offset) ISO string as local time per ECMA-262, so `getHours()`/`getMinutes()`
 * already read local components; a "Z"-suffixed string also converts correctly since `getHours()`
 * is always local-timezone, never UTC. */
export function mealPeriodForTime(loggedAt: string): HallMealPeriod {
  const d = new Date(loggedAt);
  const minutes = d.getHours() * 60 + d.getMinutes();
  let period: HallMealPeriod = "latenight";
  for (const b of MEAL_BOUNDARIES) {
    if (minutes >= b.startMinutes) period = b.period;
  }
  return period;
}

/** The one rounding definition for "this entry's calories, as displayed" -- used by both the item
 * row and the group subtotal (and, transitively, the stat card total in YouPane.tsx) so the render
 * seams can't drift out of agreement with each other. */
export function entryCalories(entry: LogEntry): number {
  return Math.round(entry.nutrition.calories * entry.servings);
}

export interface MealLogGroup {
  period: HallMealPeriod;
  label: string;
  entries: LogEntry[];
  totalCalories: number;
}

/**
 * Buckets entries by mealPeriodForTime into canvas-order groups (Breakfast, Lunch, Dinner, Late
 * Night), omitting any period with no entries. Group order and labels come from shared's
 * MEAL_PERIODS/mealPeriodLabel -- which periods can appear at all is still gated by MEAL_BOUNDARIES.
 *
 * Each group's `totalCalories` sums the same *rounded* per-entry calories the item rows display
 * (`Math.round(calories * servings)`), not the raw float sum -- integer addition is exactly
 * associative, so group subtotals always sum to the overall total regardless of partitioning.
 * Rounding the raw float sum once at the end can disagree by a calorie whenever a source contributes
 * fractional calories (OpenFoodFacts entries aren't whole numbers): two 100.5-calorie entries in
 * different groups each round to 101 (202 combined) while their raw sum of 201.0 rounds to 201.
 * Pre-rounding avoids that. Entries keep their input order; callers already read them
 * chronologically, so groups render chronologically too.
 */
export function groupEntriesByMeal(entries: LogEntry[]): MealLogGroup[] {
  const byPeriod = new Map<HallMealPeriod, LogEntry[]>();
  for (const entry of entries) {
    const period = mealPeriodForTime(entry.loggedAt);
    const bucket = byPeriod.get(period);
    if (bucket) bucket.push(entry);
    else byPeriod.set(period, [entry]);
  }
  return MEAL_PERIODS.filter((period) => byPeriod.has(period)).map((period) => {
    const groupEntries = byPeriod.get(period)!;
    const totalCalories = groupEntries.reduce((sum, e) => sum + entryCalories(e), 0);
    return { period, label: mealPeriodLabel(period), entries: groupEntries, totalCalories };
  });
}
