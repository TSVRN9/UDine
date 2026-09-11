import { isoDateOf, type LogEntry } from "@udine/shared";
import { entryCalories, entryDishName, groupEntriesByMeal, type HallMealPeriod } from "./youPaneFormat";

/** "8:40 AM" -- the Logs screen's edit-state row shows a per-entry time (e.g. "Hampshire · 8:40 AM
 * · 320 cal each"). `new Date(loggedAt)` parses a bare (no "Z"/offset) ISO string as local time per
 * ECMA-262, so getHours()/getMinutes() already read local components for both freshly-stamped
 * entries and legacy Z-suffixed ones. */
export function formatLogTime(loggedAt: string): string {
  const d = new Date(loggedAt);
  let hour = d.getHours();
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${String(d.getMinutes()).padStart(2, "0")} ${suffix}`;
}

/** Local-date arithmetic on a "YYYY-MM-DD" string, avoiding the `new Date("YYYY-MM-DD")` UTC-
 * midnight parse trap -- a bare date-ONLY ISO string parses as UTC per ECMA-262, unlike a bare
 * date-TIME string (which parses local, per date.ts's nowLocalIso comment on the sibling gotcha).
 * Builds/reads Date components explicitly so this always stays in the caller's local calendar. */
function addDaysIso(dateIso: string, deltaDays: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** Last 7 calendar dates ending at (and including) `todayIso`, oldest first -- the trailing window
 * the Last 7 Days chart trends over (a rolling daily-rate view, deliberately NOT the same window as
 * the week strip below -- see currentWeekDates's doc comment on why those two have to differ). */
export function lastSevenDates(todayIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(todayIso, i - 6));
}

/** The Sun-Sat calendar week containing `todayIso`, oldest (Sunday) first. Deliberately NOT
 * lastSevenDates's trailing window: the issue's own week-strip spec styles a "future" day (muted
 * 0.35-alpha ink, 0.1-alpha border) distinctly from a past/today one -- a trailing window ending at
 * today can never contain a day after today, which would make that state permanently unreachable.
 * A calendar week does: Thursday's week still shows Friday/Saturday, correctly muted as not-yet-
 * loggable. */
export function currentWeekDates(todayIso: string): string[] {
  const [y, m, d] = todayIso.split("-").map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay(); // 0 = Sunday
  const sunday = addDaysIso(todayIso, -dayOfWeek);
  return Array.from({ length: 7 }, (_, i) => addDaysIso(sunday, i));
}

export interface WeekDayChip {
  date: string; // YYYY-MM-DD
  dayLabel: string; // "TUE"
  dayNumber: number; // 19
  hasLogs: boolean;
  isSelected: boolean;
  isFuture: boolean;
}

/** Week-strip chip data for the calendar week containing today (see currentWeekDates): a gold dot
 * on days with at least one entry (LOCAL day, via isoDateOf on loggedAt -- same bucketing every
 * other local-day read in this app uses, see date.ts), the caller's selected day filled, and any
 * day past `todayIso` flagged so the UI can mute it. */
export function buildWeekStrip(entries: LogEntry[], selectedDate: string, todayIso: string): WeekDayChip[] {
  const loggedDates = new Set(entries.map((e) => isoDateOf(e.loggedAt)));
  return currentWeekDates(todayIso).map((date) => {
    const [y, m, d] = date.split("-").map(Number);
    const weekday = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
    return {
      date,
      dayLabel: weekday,
      dayNumber: d,
      hasLogs: loggedDates.has(date),
      isSelected: date === selectedDate,
      isFuture: date > todayIso,
    };
  });
}

export interface WeekChartDay {
  date: string;
  calories: number;
  isToday: boolean;
  isSelected: boolean;
}

export interface WeekChartData {
  days: WeekChartDay[];
  avgCalories: number;
  avgProteinG: number;
}

/** Last 7 Days bar-chart data. Per-day calories: round-per-entry-then-sum, the same convention
 * groupEntriesByMeal uses for meal subtotals -- keeps a day's bar/total agreeing exactly with that
 * day's own log-screen total, not just approximately. Averages are over the full 7-day window,
 * including no-log days -- "cal / day" reads as a daily rate over the week, and a user who only
 * logged 3 of the last 7 days should see that reflected as a lower average, not one inflated by
 * silently excluding the days they skipped.
 *
 * Protein follows the same round-per-entry-then-sum convention as calories, for consistency, even
 * though there's no displayed protein subtotal elsewhere on this screen to visibly disagree with.
 * Kept uniform anyway so the file has one rounding rule, not two. */
export function buildWeekChart(entries: LogEntry[], todayIso: string, selectedDate: string): WeekChartData {
  const dates = lastSevenDates(todayIso);
  const dateSet = new Set(dates);
  const days = dates.map((date) => {
    const dayEntries = entries.filter((e) => isoDateOf(e.loggedAt) === date);
    const calories = dayEntries.reduce((sum, e) => sum + entryCalories(e), 0);
    return { date, calories, isToday: date === todayIso, isSelected: date === selectedDate };
  });
  const totalCalories = days.reduce((sum, d) => sum + d.calories, 0);
  const totalProtein = entries
    .filter((e) => dateSet.has(isoDateOf(e.loggedAt)))
    .reduce((sum, e) => sum + Math.round(e.nutrition.proteinG * e.servings), 0);
  return {
    days,
    avgCalories: Math.round(totalCalories / days.length),
    avgProteinG: Math.round(totalProtein / days.length),
  };
}

/** Current consecutive-day logging streak, counted backward from today -- with a same-day grace
 * period: if today has no entry yet, start counting from yesterday instead, so not having logged
 * yet today doesn't zero out a streak the user already earned. Null (not 0) when there's no active
 * streak. */
export function computeLoggingStreak(entries: LogEntry[], todayIso: string): number | null {
  const loggedDates = new Set(entries.map((e) => isoDateOf(e.loggedAt)));
  let cursor = loggedDates.has(todayIso) ? todayIso : addDaysIso(todayIso, -1);
  let streak = 0;
  while (loggedDates.has(cursor)) {
    streak++;
    cursor = addDaysIso(cursor, -1);
  }
  return streak === 0 ? null : streak;
}

export interface MostLoggedDish {
  name: string;
  count: number; // total servings logged, summed across every entry for that dish
}

/** The dish/product logged the most, by total servings summed across every entry sharing that name
 * -- three 1-serving entries and one 3-serving entry both mean "eaten it 3 times". Null when there
 * are no entries at all. Ties break in favor of whichever dish was logged FIRST: `counts` is a Map
 * built by iterating `entries` in order, and the `>` (not `>=`) comparison below keeps the
 * earliest-inserted key at a tied count rather than letting a later one overwrite it. Since storage
 * orders entries by logged_at, that reads as "whichever you ate first" -- deterministic, not an
 * accident of Map ordering. */
export function computeMostLoggedDish(entries: LogEntry[]): MostLoggedDish | null {
  if (entries.length === 0) return null;
  const counts = new Map<string, number>();
  for (const e of entries) {
    const name = entryDishName(e);
    counts.set(name, (counts.get(name) ?? 0) + e.servings);
  }
  let best: MostLoggedDish | null = null;
  for (const [name, count] of counts) {
    if (!best || count > best.count) best = { name, count };
  }
  return best;
}

/** Count of distinct dish/product names ever logged. Null (not 0) when there are no entries at
 * all -- the only way this count would legitimately be zero. */
export function computeDistinctDishCount(entries: LogEntry[]): number | null {
  if (entries.length === 0) return null;
  return new Set(entries.map(entryDishName)).size;
}

export interface MealShare {
  period: HallMealPeriod;
  label: string;
  pct: number; // 0-100, rounded
}

/** The meal period carrying the largest share of all-time logged calories, e.g. "58% of your
 * calories happen at lunch". Null when total calories is 0 (no entries, or every entry happens to
 * be 0-calorie) -- a share of a zero total isn't a meaningful percentage. */
export function computeTopMealShare(entries: LogEntry[]): MealShare | null {
  const groups = groupEntriesByMeal(entries);
  const total = groups.reduce((sum, g) => sum + g.totalCalories, 0);
  if (total === 0) return null;
  const top = groups.reduce((best, g) => (g.totalCalories > best.totalCalories ? g : best));
  return { period: top.period, label: top.label, pct: Math.round((100 * top.totalCalories) / total) };
}

export interface FunStat {
  figure: string;
  caption: string;
  gold: boolean;
}

/** For Fun's 2x2 stat grid, canvas order: logging streak, most-logged dish, distinct dishes tried,
 * top meal's calorie share. Each stat is independently gated -- skip any stat with insufficient
 * data rather than showing zeros -- so the grid renders anywhere from 0 to 4 cards depending on how
 * much the device has logged. */
export function buildFunStats(entries: LogEntry[], todayIso: string): FunStat[] {
  const stats: FunStat[] = [];

  const streak = computeLoggingStreak(entries, todayIso);
  if (streak !== null) {
    stats.push({ figure: String(streak), caption: streak === 1 ? "day logging streak" : "days logging streak", gold: false });
  }

  const mostLogged = computeMostLoggedDish(entries);
  if (mostLogged !== null) {
    stats.push({ figure: `× ${mostLogged.count}`, caption: `${mostLogged.name} — your most logged dish`, gold: false });
  }

  const distinct = computeDistinctDishCount(entries);
  if (distinct !== null) {
    stats.push({
      figure: String(distinct),
      caption: distinct === 1 ? "different dish tried across all halls" : "different dishes tried across all halls",
      gold: false,
    });
  }

  const mealShare = computeTopMealShare(entries);
  if (mealShare !== null) {
    stats.push({ figure: `${mealShare.pct}%`, caption: `of your calories happen at ${mealShare.label.toLowerCase()}`, gold: true });
  }

  return stats;
}
