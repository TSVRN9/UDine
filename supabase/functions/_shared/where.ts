// Deno port of the dish sheet's "where" sentence: wherePlan, whenText, mealWindow (app/lib/core/m2/where.dart) and
// effectiveMealWindow (app/lib/core/hours.dart). Dart is the source; shared/vectors/where.json is generated from it and
// where.vectors.test.ts runs the same file. Clock math is minutes since today's Eastern midnight, as in hours.ts.
// ponytail: no DST-day correction (a window spanning the 2 AM change is off by an hour on two days a year), as hours.ts.
import { type HallHours, minutesToLabel, parseTimeOfDay, type TimeWindow } from "./hours.ts";

export interface Board {
  places: { key: string; area: number }[];
  /** A café has only `general`. */
  hours: Record<string, HallHours>;
  grab: Record<string, TimeWindow>;
  /** iso day -> place -> meal -> dish names */
  days: Record<string, Record<string, Record<string, string[]>>>;
}

export interface WhereGroup {
  st: "now" | "later" | "tomorrow";
  meal: string;
  day: number;
  open: string;
  close: string;
  halls: string[];
}

type HallMealPeriod = "breakfast" | "lunch" | "dinner" | "latenight";
const STANDARD: Record<HallMealPeriod, TimeWindow> = {
  breakfast: { openTime: "7:00 AM", closeTime: "11:00 AM" },
  lunch: { openTime: "11:00 AM", closeTime: "4:30 PM" },
  dinner: { openTime: "4:30 PM", closeTime: "9:00 PM" },
  latenight: { openTime: "9:00 PM", closeTime: "2:00 AM" },
};
const STANDARD_OF: Record<string, HallMealPeriod> = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner", late: "latenight" };
const HALLS = ["W", "F", "H", "B"];
const MEAL_LABEL: Record<string, string> = {
  breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", late: "Late night", all: "All day", grab: "Grab 'N Go",
};

const isCafe = (k: string) => k.startsWith("c");
const placeOrder = (k: string) => (isCafe(k) ? 4 + Number(k.slice(1)) : HALLS.indexOf(k));
const dishKey = (name: string) => name.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const toMin = (t: string) => parseTimeOfDay(t)!;

type Resolved = { contains: boolean; open: number; close: number; valid: boolean };

/** Half-open [open, close) on today's minute axis; close <= open crosses midnight. The probe in mealWindow is at general's open, so
 * yesterday's occurrence (which the Dart resolve also checks) can never contain it and is left out. */
function resolve(now: number, w: TimeWindow): Resolved {
  const o = parseTimeOfDay(w.openTime), c = parseTimeOfDay(w.closeTime);
  if (o === null || c === null || o === c) return { contains: false, open: now, close: now, valid: false };
  const crosses = c <= o;
  const open = o, close = crosses ? c + 1440 : c;
  if (now >= open && now < close) return { contains: true, open, close, valid: true };
  return { contains: false, open, close, valid: true };
}

/** The window governing `key` at `now` (minutes since today's Eastern midnight): the hall's own, else the standard one
 * clamped to `general` (only while general confirms the hall is open). */
export function effectiveMealWindow(hours: HallHours, key: HallMealPeriod, now: number): TimeWindow | null {
  const own = hours[key] ?? null;
  if (own) return own;
  if (!hours.general) return null;
  const general = resolve(now, hours.general);
  if (!general.contains) return null;
  const standard = resolve(now, STANDARD[key]);
  if (!standard.valid) return null;
  const open = Math.max(standard.open, general.open), close = Math.min(standard.close, general.close);
  if (open >= close) return null;
  const label = (m: number) => minutesToLabel(((m % 1440) + 1440) % 1440);
  return { openTime: label(open), closeTime: label(close) };
}

/** The window a place serves a meal, whatever the clock says: effectiveMealWindow probed at the place's own opening time. */
export function mealWindow(fx: Board, place: string, meal: string): [string, string] | null {
  const h = fx.hours[place];
  if (!h) return null;
  if (!isCafe(place) && meal === "grab") {
    const g = fx.grab[place];
    return g ? [g.openTime, g.closeTime] : null;
  }
  if (meal === "all" || meal === "grab") return h.general ? [h.general.openTime, h.general.closeTime] : null;
  if (!h.general) return null;
  const w = effectiveMealWindow(h, STANDARD_OF[meal], toMin(h.general.openTime));
  return w ? [w.openTime, w.closeTime] : null;
}

const fmtMin = (m: number) => minutesToLabel(m);

/** Eastern wall-clock fields of an instant. */
function easternWall(instant: Date) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return { iso: `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}-${p.find((x) => x.type === "day")!.value}`, min: (get("hour") % 24) * 60 + get("minute") };
}
const shiftIso = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/** Every group a dish is served in, soonest first. `newton` stays false on the server: topics are per dish, not per user. */
export function wherePlan(fx: Board, dish: string, instant: Date, opts: { newton?: boolean } = {}): WhereGroup[] {
  const { iso: today, min: nowMin } = easternWall(instant);
  const key = dishKey(dish);
  const inNewton = new Set(fx.places.filter((p) => p.area === 4).map((p) => p.key));
  const groups = new Map<string, { g: WhereGroup; open: number; close: number; order: number }>();
  // Yesterday's menus count too, for a window that crossed midnight and is still open.
  [shiftIso(today, -1), today, shiftIso(today, 1)].forEach((iso, i) => {
    const rel = i - 1, day = rel === 1 ? 1 : 0;
    for (const [place, meals] of Object.entries(fx.days[iso] ?? {})) {
      if (inNewton.has(place) && !opts.newton) continue;
      for (const [meal, names] of Object.entries(meals)) {
        if (!names.some((n) => dishKey(n) === key)) continue;
        const win = mealWindow(fx, place, meal);
        if (!win) continue;
        const w: [number, number] = [toMin(win[0]), toMin(win[1])];
        const crosses = w[1] <= w[0]; // a close at or before its open is the next day's
        const end = crosses ? w[1] + 1440 : w[1];
        const st = rel === 1 ? "tomorrow" : rel === -1 ? (crosses && nowMin < w[1] ? "now" : "past") : nowMin >= end ? "past" : nowMin >= w[0] ? "now" : "later";
        if (st === "past") continue;
        const gk = `${st},${meal},${w[0]},${w[1]}`;
        if (!groups.has(gk)) {
          groups.set(gk, { g: { st, meal, day, open: fmtMin(w[0]), close: fmtMin(w[1]), halls: [] }, open: w[0], close: end, order: groups.size });
        }
        const acc = groups.get(gk)!;
        if (!acc.g.halls.includes(place)) acc.g.halls.push(place);
      }
    }
  });
  const rank = { now: 0, later: 1, tomorrow: 2 };
  return [...groups.values()]
    .sort((a, b) =>
      rank[a.g.st] - rank[b.g.st] ||
      (a.g.st === "now" ? a.close - b.close : a.open - b.open) ||
      placeOrder(a.g.halls[0]) - placeOrder(b.g.halls[0]) ||
      a.order - b.order
    )
    .map((a) => ({ ...a.g, halls: [...a.g.halls].sort((x, y) => placeOrder(x) - placeOrder(y)) }));
}

export function fmtT(t: string): string {
  const m = toMin(t);
  if (m >= 1439) return "midnight";
  if (m === 720) return "noon";
  return `${Math.floor((m + 660) % 720 / 60) + 1}${m % 60 ? `:${String(m % 60).padStart(2, "0")}` : ""} ${m < 720 ? "AM" : "PM"}`;
}

/** What the sheet prints for a group; a second line for the same meal at the same moment only gives its own time. */
export function whenText(g: WhereGroup, prev?: WhereGroup): string {
  const same = !!prev && prev.st === g.st && prev.meal === g.meal;
  const label = MEAL_LABEL[g.meal];
  if (g.meal === "all") {
    return g.st === "now" ? (same ? `Until ${fmtT(g.close)}` : `Now, until ${fmtT(g.close)}`)
      : g.st === "later" ? `From ${fmtT(g.open)}` : `Tomorrow, from ${fmtT(g.open)}`;
  }
  return g.st === "now" ? (same ? `Until ${fmtT(g.close)}` : `${label} now, until ${fmtT(g.close)}`)
    : g.st === "later" ? (same ? `From ${fmtT(g.open)}` : `${label} from ${fmtT(g.open)}`)
    : `Tomorrow, ${g.meal === "grab" ? "Grab 'N Go" : label.toLowerCase()} from ${fmtT(g.open)}`;
}
