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
 *
 * Doc trap, not modeled above (deliberately) -- confirmed against a live capture 2026-08-19
 * (`curl -sL https://www.umassdining.com/uapp/get_infov2`): every location also carries a
 * `new_location_hour.exceptions` array. It looks like the obvious place to read holiday/closure
 * overrides from, but on all four commons it holds only two stale 2019 Thanksgiving-week rows
 * (`"date": "11/23/2019 - 11/30/2019"`, `"11/30/2019 - 12/24/2019"`) -- it is NOT live closure data
 * and must not be read for that purpose. The real, current closure notice (today: "Summer Hours /
 * Monday 05/18 - Monday 08/31 / Closed") lives in the `locations` field instead, an HTML blob of the
 * full hours table -- and its `/` date separators are JSON-escaped (`05\/18`, not `05/18`) in the raw
 * response body, so a raw grep for the unescaped date text won't find it there either. Neither field
 * is read by this module today; if a future feature needs closure overrides, it needs the
 * `locations` blob, not `exceptions` (issue #100 item 5).
 */
export interface InfoV2Location {
  location_title: string;
  opening_hours: string;
  closing_hours: string;
  // Optional, not just nullable: only 21 of 40 live objects carry these keys at all (retail
  // locations in particular often omit them rather than publishing `null`) -- windowOrNull already
  // treats `undefined` the same as `null`/"" (falsy -> "no window"), so this is a type-only fix
  // matching an already-safe runtime (issue #100 item 2).
  breakfast_open_time?: string | null;
  breakfast_close_time?: string | null;
  lunch_open_time?: string | null;
  lunch_close_time?: string | null;
  dinner_open_time?: string | null;
  dinner_close_time?: string | null;
  // #176: café-tap prerequisite plumbing, retail-only. location_id IS the foodpro-menu-ajax tid for
  // this location (confirmed live 2026-08-24: Green Fields 4671, Harvest Market 4306, People's
  // Organic Coffee 32 -- also present and correct on the 4 commons, e.g. Berkshire Dining Commons
  // location_id=4 matches DINING_HALLS' own tid=4, though mapInfoV2 doesn't read it there). All
  // optional: same trust-boundary posture as the per-meal time fields above -- a future capture
  // that omits or mangles one of these must degrade mapInfoV2's output to undefined, not throw.
  location_id?: number;
  breakfast_menu?: string | null;
  lunch_menu?: string | null;
  dinner_menu?: string | null;
  short_description_v2?: string | null;
  address?: string | null;
  map_address?: string | null;
  accepted_payment?: string | null;
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

// #176: an empty/absent *_menu field means "no menu published for this meal here" -- null, same
// "falsy -> no data" convention windowOrNull already uses for hours, not an empty string a client
// would have to check for separately.
function stringOrNull(s: string | null | undefined): string | null {
  return s ? s : null;
}

// #176: description/address/mapAddress/acceptedPayment are plain optional strings, not nullable --
// an empty/absent raw value just means the field wasn't parsed off this object, same "degrade to
// undefined, never throw" posture as locationId below.
function stringOrUndefined(s: string | null | undefined): string | undefined {
  return s ? s : undefined;
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
      retail.push({
        name: loc.location_title,
        hours: general,
        locationId: typeof loc.location_id === "number" ? loc.location_id : undefined,
        breakfastMenu: stringOrNull(loc.breakfast_menu),
        lunchMenu: stringOrNull(loc.lunch_menu),
        dinnerMenu: stringOrNull(loc.dinner_menu),
        description: stringOrUndefined(loc.short_description_v2),
        address: stringOrUndefined(loc.address),
        mapAddress: stringOrUndefined(loc.map_address),
        acceptedPayment: stringOrUndefined(loc.accepted_payment),
      });
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
 *
 * `valid: false` is the fallback for two trust-boundary cases that only matter for hand-built windows
 * (windowOrNull already screens these out of the get_infov2 mapping, but currentMealPeriod/openStatus
 * accept a hand-built TimeWindow directly -- see mapInfoV2's latenight doc):
 *  - openTime/closeTime that don't match "H:MM AM/PM" (e.g. "Midnight") -- would otherwise throw
 *    inside parseTimeOfDay (issue #100 item 3).
 *  - openTime === closeTime -- crossesMidnight's `<=` would otherwise treat this as a full 24h-open
 *    window, which is almost certainly a data error, not a real close-at-open-time schedule (issue
 *    #100 item 4). Pinned fallback for both: treat as "no window" (closed), same as a null window.
 */
function resolveWindow(now: Date, window: TimeWindow): { contains: boolean; open: Date; close: Date; valid: boolean } {
  let openTod: { hour: number; minute: number };
  let closeTod: { hour: number; minute: number };
  try {
    openTod = parseTimeOfDay(window.openTime);
    closeTod = parseTimeOfDay(window.closeTime);
  } catch {
    return { contains: false, open: now, close: now, valid: false };
  }

  const openMinutes = openTod.hour * 60 + openTod.minute;
  const closeMinutes = closeTod.hour * 60 + closeTod.minute;
  if (openMinutes === closeMinutes) return { contains: false, open: now, close: now, valid: false };

  const crossesMidnight = closeMinutes <= openMinutes;
  const open = atLocalTime(now, window.openTime);
  const close = atLocalTime(now, window.closeTime, crossesMidnight ? 1 : 0);

  if (now >= open && now < close) return { contains: true, open, close, valid: true };

  if (crossesMidnight) {
    const yesterdayOpen = atLocalTime(now, window.openTime, -1);
    const yesterdayClose = atLocalTime(now, window.closeTime, 0);
    if (now >= yesterdayOpen && now < yesterdayClose) return { contains: true, open: yesterdayOpen, close: yesterdayClose, valid: true };
  }

  return { contains: false, open, close, valid: true };
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
 * otherwise a hall open until 9 PM generally would incorrectly report closing at breakfast's 10 AM.
 * `closesAt` also chains through contiguous/overlapping windows that don't themselves contain `now`
 * (e.g. breakfast 7-10 adjacent to lunch 10-2 reports closesAt 2 PM at 9 AM, not 10 AM) -- unreachable
 * through mapInfoV2 today (open locations publish a whole-day general window, not adjacent per-meal
 * windows) but real the moment a latenight/per-meal source with back-to-back windows is injected
 * (issue #100 item 1). Windows that fail to resolve (see resolveWindow's `valid` doc) are ignored
 * entirely, contributing to neither closesAt nor opensAt. */
export function openStatus(hours: DiningHallHours, now: Date): OpenStatus {
  const windows = [hours.breakfast, hours.lunch, hours.dinner, hours.latenight, hours.general].filter(
    (w): w is TimeWindow => w !== null,
  );
  const resolved = windows.map((w) => resolveWindow(now, w)).filter((r) => r.valid);

  let closesAt: Date | null = null;
  for (const r of resolved) {
    if (r.contains && (closesAt === null || r.close > closesAt)) closesAt = r.close;
  }
  if (closesAt !== null) {
    for (let extended = true; extended; ) {
      extended = false;
      for (const r of resolved) {
        if (r.open <= closesAt && r.close > closesAt) {
          closesAt = r.close;
          extended = true;
        }
      }
    }
    return { open: true, closesAt };
  }

  let opensAt: Date | null = null;
  for (const r of resolved) {
    if (r.open > now && (opensAt === null || r.open < opensAt)) opensAt = r.open;
  }
  return { open: false, opensAt };
}
