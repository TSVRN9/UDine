import { hallNameFor, hallNameForOrNull, rankFoods, scoreOutOfTen, type HallCompletion, type LogEntry, type MealStatus, type RankedDish, type RankedFood } from "@udine/shared";

/**
 * Carry-over note 3 (#92, from #97's review): shared's HallCompletion.pct rounds half-up
 * (Math.round), so e.g. 199/200 seen dishes logged reads back as pct 100 even though one dish is
 * still unlogged. Recomputed from the raw counts with Math.floor instead — feeds both the bar's
 * fill width and its numeric label, so "100%" only ever appears once loggedDistinct === seenDistinct.
 */
export function displayCompletionPct(c: Pick<HallCompletion, "loggedDistinct" | "seenDistinct">): number {
  return c.seenDistinct === 0 ? 0 : Math.floor((100 * c.loggedDistinct) / c.seenDistinct);
}

/** Gold for every food tied at the top score, maroon otherwise — canvas spec. */
export function pillTone(score: number, maxScore: number): "gold" | "maroon" {
  return score === maxScore ? "gold" : "maroon";
}

/**
 * Carry-over note 4: RankedFood scores are cross-hall (identity by dishName alone — see
 * docs/adr/0001), but the canvas shows a hall label next to each top food. Derived presentationally,
 * not part of the score: the highest-rated per-hall RankedDish sharing that name, or (if this device
 * never compared that dish at any hall — shouldn't normally happen, since a food comparison always
 * updates the matching RankedDish too, but logged-without-yet-compared is possible) the hall of the
 * most recent log entry for that dish name. Null if neither source has it.
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
 * gate (real comparisons exist, no scores yet), this returns [] even though rankedFoods isn't empty:
 * the "halls ranked, no food scores yet" in-between state from carry-over note 2.
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
 * on-campus entry, the OpenFoodFacts product name for an off-menu (barcode) one. PR #140 review
 * (issue #142): this ternary existed as three separate copies (here inline, logsFormat.ts's
 * entryDishName, logs.tsx's dishNameOf) -- consolidated onto this one export, which the other two
 * now both import instead of re-deriving. */
export function entryDishName(entry: LogEntry): string {
  return entry.source.type === "umass-menu" ? entry.source.dishName : entry.source.productName;
}

/** Single-line item text per the canvas: "<dish> × <qty> · <hall>", qty omitted when it's 1, hall
 * omitted for off-menu (barcode) entries that don't have one. Extracted out of YouPane.tsx -- #119's
 * Logs & stats screen renders the same collapsed row. Hall lookup itself is @udine/shared's
 * hallNameFor (#108) -- this used to be a module-local copy of the same tid-to-name lookup. */
export function logItemLine(entry: LogEntry): string {
  const name = entryDishName(entry);
  const qty = entry.servings !== 1 ? ` × ${entry.servings}` : "";
  const hall = entry.source.type === "umass-menu" ? ` · ${hallNameFor(entry.source.hallTid)}` : "";
  return `${name}${qty}${hall}`;
}

// --- Today's Log meal grouping (#118) --------------------------------------------------------

export type MealPeriod = Exclude<MealStatus, "closed">;

const MEAL_LABELS: Record<MealPeriod, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  latenight: "Late Night",
};

/**
 * Canonical, contiguous local-clock windows (minutes since local midnight) a log entry's time gets
 * bucketed against -- NOT the live per-hall hours from #88's hours.ts (`currentMealPeriod` needs a
 * fetched `DiningHallHours` for a specific hall/day, which off-menu barcode entries don't have at
 * all and a device-local log spanning many past days can't retroactively re-fetch). These windows
 * cover the full 24h day back-to-back (late night's 9 PM start runs through breakfast's 5 AM start
 * the next morning), so every entry falls inside exactly one enclosing period by construction --
 * satisfying the issue's "outside any window falls to the nearest/enclosing period" ask without a
 * separate fallback branch. Sorted ascending; the last boundary <= the entry's minute-of-day wins,
 * with "latenight" as the default for minutes before breakfast's 5:00 AM start (the crossesMidnight
 * wrap). NOTE: this only decides which MEAL GROUP a 12:30 AM entry lands in (Late Night); which
 * DAY's card it renders on is a separate decision made upstream by the caller's own
 * `isoDateOf(loggedAt) === todayIso()` filter -- so a 12:30 AM entry shows in *today's* Today's Log,
 * grouped under Late Night alongside tonight's later entries, not "yesterday's" card.
 */
const MEAL_BOUNDARIES: { period: MealPeriod; startMinutes: number }[] = [
  { period: "breakfast", startMinutes: 5 * 60 }, // 5:00 AM
  { period: "lunch", startMinutes: 10 * 60 + 30 }, // 10:30 AM
  { period: "dinner", startMinutes: 14 * 60 }, // 2:00 PM
  { period: "latenight", startMinutes: 21 * 60 }, // 9:00 PM
];

/** Which meal period a LogEntry.loggedAt timestamp falls into, by LOCAL clock time. `new Date()`
 * parses a bare (no "Z"/offset) ISO string -- the shape every entry is stamped with post-#111 --
 * as local time per ECMA-262, so `getHours()`/`getMinutes()` already read local components; a
 * "Z"-suffixed string (old data, or a test fixture) also converts correctly since `getHours()` is
 * always local-timezone, never UTC. */
export function mealPeriodForTime(loggedAt: string): MealPeriod {
  const d = new Date(loggedAt);
  const minutes = d.getHours() * 60 + d.getMinutes();
  let period: MealPeriod = "latenight";
  for (const b of MEAL_BOUNDARIES) {
    if (minutes >= b.startMinutes) period = b.period;
  }
  return period;
}

/** The one rounding definition for "this entry's calories, as displayed" -- used by both the item
 * row and the group subtotal (and, transitively, the stat card total derived from group subtotals
 * in YouPane.tsx) so the three render seams can't drift out of agreement with each other. Review
 * finding on #118's PR: writing `Math.round(calories * servings)` out twice (once here, once
 * inline in YouPane.tsx) left that agreement untested and unenforced -- a future edit to one site
 * and not the other would silently break the reconciliation this PR exists to guarantee. */
export function entryCalories(entry: LogEntry): number {
  return Math.round(entry.nutrition.calories * entry.servings);
}

export interface MealLogGroup {
  period: MealPeriod;
  label: string;
  entries: LogEntry[];
  totalCalories: number;
}

const MEAL_ORDER: MealPeriod[] = ["breakfast", "lunch", "dinner", "latenight"];

/**
 * Buckets entries by mealPeriodForTime into canvas-order groups (Breakfast, Lunch, Dinner, Late
 * Night), omitting any period with no entries. Each group's `totalCalories` sums the same *rounded*
 * per-entry calories the item rows themselves display (`Math.round(calories * servings)`), NOT the
 * raw float sum -- integer addition is exactly associative, so summing every group's totalCalories
 * always equals the sum over ALL entries computed the same way, regardless of how they're
 * partitioned into groups. That's what makes issue #118's "group subtotals must agree with the day
 * totals" ask hold *exactly*, not just approximately: rounding the raw float sum once at the end
 * (`Math.round(sum of raw calories)`) and rounding per-entry-then-summing can legitimately disagree
 * by a calorie whenever a source contributes fractional calories (UMass menu calories are whole
 * numbers, but OpenFoodFacts-sourced "off" entries aren't, e.g. `energy-kcal_serving: 137.5`) --
 * two 100.5-calorie entries in different meal groups each round to 101 (202 combined) while their
 * raw sum of 201.0 rounds to 201, a real off-by-one otherwise. Pre-rounding avoids that entirely.
 * Entries keep their input order within a group; callers already read entries chronologically
 * (SqliteLogStorage orders by logged_at), so groups render chronologically too without an extra
 * sort here.
 */
export function groupEntriesByMeal(entries: LogEntry[]): MealLogGroup[] {
  const byPeriod = new Map<MealPeriod, LogEntry[]>();
  for (const entry of entries) {
    const period = mealPeriodForTime(entry.loggedAt);
    const bucket = byPeriod.get(period);
    if (bucket) bucket.push(entry);
    else byPeriod.set(period, [entry]);
  }
  return MEAL_ORDER.filter((period) => byPeriod.has(period)).map((period) => {
    const groupEntries = byPeriod.get(period)!;
    const totalCalories = groupEntries.reduce((sum, e) => sum + entryCalories(e), 0);
    return { period, label: MEAL_LABELS[period], entries: groupEntries, totalCalories };
  });
}
