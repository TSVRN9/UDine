import { DINING_HALLS } from "./umassDining.ts";
import type { DiningHallHours, DiningHoursFeed, MealStatus, OpenStatus, RetailLocationHours, TimeWindow } from "./types.ts";

const BASE = "https://www.umassdining.com/uapp";

/**
 * Raw shape of one element of GET /uapp/get_infov2 (confirmed live 2026-08-19, see
 * docs/apk-reverse-engineering.md) -- only the fields this module reads. "Closed" locations
 * report opening_hours/closing_hours as the literal string "Closed" and the per-meal time
 * fields as "" (empty string); locations that only publish general hours (e.g. summer
 * schedule) report the per-meal fields as `null` instead. Both are treated as "no window".
 * Exported so tests can type their captured fixture against the real raw shape instead of `any`.
 */
export interface InfoV2Location {
  location_title: string;
  opening_hours: string;
  closing_hours: string;
  breakfast_open_time: string | null;
  breakfast_close_time: string | null;
  lunch_open_time: string | null;
  lunch_close_time: string | null;
  dinner_open_time: string | null;
  dinner_close_time: string | null;
}

const TIME_PATTERN = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;

/** Builds a window from raw open/close strings, or null if either side is absent, "Closed", or not
 * a recognized "H:MM AM/PM" time. That last check matters at this trust boundary specifically: the
 * `locations` HTML blob elsewhere in the same get_infov2 payload uses words like "Midnight" for
 * times, so a future field using that style landing here should degrade to "no window" rather than
 * throwing deep inside currentMealPeriod/openStatus when a caller (e.g. a UI render) hits it. */
function windowOrNull(open: string | null | undefined, close: string | null | undefined): TimeWindow | null {
  if (!open || !close) return null;
  if (!TIME_PATTERN.test(open.trim()) || !TIME_PATTERN.test(close.trim())) return null;
  return { openTime: open, closeTime: close };
}

/**
 * The 4 commons' get_infov2 titles don't match DINING_HALLS.name exactly ("Worcester Commons" vs
 * "Berkshire Dining Commons" -- no consistent suffix), but every commons title starts with the hall
 * name and contains "Commons", and nothing else in the 40-location feed does (verified against a
 * live capture 2026-08-19: cafés/retail/Grab'n Go locations that also start with a hall name, e.g.
 * "Worcester Café" and "Worcester Grab'n Go", don't contain "Commons").
 */
function matchesHall(locationTitle: string, hallName: string): boolean {
  return locationTitle.startsWith(hallName) && locationTitle.includes("Commons");
}

/** Maps the raw get_infov2 array into typed hours. Exported (alongside fetchDiningHours) so tests
 * can exercise the mapping directly against a captured fixture without a network call. */
export function mapInfoV2(data: InfoV2Location[]): DiningHoursFeed {
  const halls: DiningHallHours[] = [];
  const retail: RetailLocationHours[] = [];

  for (const loc of data) {
    const hall = DINING_HALLS.find((h) => matchesHall(loc.location_title, h.name));
    const general = windowOrNull(loc.opening_hours, loc.closing_hours);
    if (hall) {
      halls.push({
        hallTid: hall.tid,
        breakfast: windowOrNull(loc.breakfast_open_time, loc.breakfast_close_time),
        lunch: windowOrNull(loc.lunch_open_time, loc.lunch_close_time),
        dinner: windowOrNull(loc.dinner_open_time, loc.dinner_close_time),
        // get_infov2 has no late-night time fields at all (only a `latenight_menu` content
        // string, same shape as breakfast_menu/lunch_menu/dinner_menu) -- always null here.
        // currentMealPeriod/openStatus still accept a hand-built latenight window so callers
        // with another source for it (or tests) can exercise the overnight math.
        latenight: null,
        general,
      });
    } else {
      retail.push({ name: loc.location_title, hours: general });
    }
  }

  return { halls, retail };
}

/** GET /uapp/get_infov2 -- confirmed live, see docs/apk-reverse-engineering.md. */
export async function fetchDiningHours(): Promise<DiningHoursFeed> {
  const res = await fetch(`${BASE}/get_infov2`);
  if (!res.ok) throw new Error(`get_infov2 ${res.status}`);
  const data = (await res.json()) as InfoV2Location[];
  return mapInfoV2(data);
}

function parseTimeOfDay(time: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
  if (!m) throw new Error(`unparseable get_infov2 time: "${time}"`);
  let hour = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") hour += 12;
  return { hour, minute: Number(m[2]) };
}

/**
 * Builds a real Date for `time` on `now`'s local calendar day (+ `dayOffset` days). Local time
 * components, not `new Date(string)` -- that parses as UTC and can land on the wrong calendar day
 * under a negative-UTC-offset timezone, the same trap documented in web/src/routes/api/menu/+server.ts.
 * get_infov2's times are Eastern wall-clock with no offset info in the feed; this assumes the
 * runtime's local timezone IS Eastern (true for both our deployment targets today) rather than doing
 * a UTC conversion that would just introduce a second, unverifiable assumption.
 */
function atLocalTime(now: Date, time: string, dayOffset = 0): Date {
  const { hour, minute } = parseTimeOfDay(time);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, minute, 0, 0);
}

/**
 * Resolves a window to concrete open/close Dates relative to `now`, and says whether `now` falls in
 * it. Half-open interval [open, close) -- exactly at close time is NOT contained (see openStatus's
 * "closesAt" meaning: the moment it becomes false). Windows where close <= open cross midnight (e.g.
 * a late-night window "11:00 PM" - "1:00 AM"); both the occurrence starting today and the one
 * starting yesterday (whose tail can still cover `now` in the early morning) are checked.
 */
function resolveWindow(now: Date, window: TimeWindow): { contains: boolean; open: Date; close: Date } {
  const open = atLocalTime(now, window.openTime);
  const openTod = parseTimeOfDay(window.openTime);
  const closeTod = parseTimeOfDay(window.closeTime);
  const crossesMidnight = closeTod.hour * 60 + closeTod.minute <= openTod.hour * 60 + openTod.minute;
  const close = atLocalTime(now, window.closeTime, crossesMidnight ? 1 : 0);

  if (now >= open && now < close) return { contains: true, open, close };

  if (crossesMidnight) {
    const yesterdayOpen = atLocalTime(now, window.openTime, -1);
    const yesterdayClose = atLocalTime(now, window.closeTime, 0);
    if (now >= yesterdayOpen && now < yesterdayClose) return { contains: true, open: yesterdayOpen, close: yesterdayClose };
  }

  return { contains: false, open, close };
}

const MEAL_WINDOWS: { period: MealStatus; key: "breakfast" | "lunch" | "dinner" | "latenight" }[] = [
  { period: "breakfast", key: "breakfast" },
  { period: "lunch", key: "lunch" },
  { period: "dinner", key: "dinner" },
  { period: "latenight", key: "latenight" },
];

/** Which specific meal (if any) `hours` is currently serving. "closed" covers both a hall with no
 * hours published today and a hall between meal windows (e.g. after breakfast, before lunch). */
export function currentMealPeriod(hours: DiningHallHours, now: Date): MealStatus {
  for (const { period, key } of MEAL_WINDOWS) {
    const window = hours[key];
    if (window && resolveWindow(now, window).contains) return period;
  }
  return "closed";
}

/** Whether the hall's doors are open right now -- broader than currentMealPeriod: true if ANY
 * published window covers `now`, including `general` (a hall can be open with no specific meal
 * window active, e.g. summer schedule, which only publishes general hours). When more than one
 * window covers `now` (e.g. a semester feed publishing both a meal window and general hours for the
 * same span), `closesAt` is the LATEST of their close times, not just the first window checked --
 * otherwise a hall open until 9 PM generally would incorrectly report closing at breakfast's 10 AM. */
export function openStatus(hours: DiningHallHours, now: Date): OpenStatus {
  const windows = [hours.breakfast, hours.lunch, hours.dinner, hours.latenight, hours.general].filter(
    (w): w is TimeWindow => w !== null,
  );

  let closesAt: Date | null = null;
  for (const window of windows) {
    const resolved = resolveWindow(now, window);
    if (resolved.contains && (closesAt === null || resolved.close > closesAt)) closesAt = resolved.close;
  }
  if (closesAt !== null) return { open: true, closesAt };

  let opensAt: Date | null = null;
  for (const window of windows) {
    const open = atLocalTime(now, window.openTime);
    if (open > now && (opensAt === null || open < opensAt)) opensAt = open;
  }
  return { open: false, opensAt };
}
