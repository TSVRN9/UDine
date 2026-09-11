import { DINING_HALLS } from "./umassDining.ts";
import type { DiningHallHours, DiningHoursFeed, HallMealPeriod, MealStatus, OpenStatus, RetailLocationHours, TimeWindow } from "./types.ts";

const BASE = "https://www.umassdining.com/uapp";

/**
 * Raw shape of one element of GET /uapp/get_infov2 -- only the fields this module reads. "Closed"
 * locations report opening_hours/closing_hours as the literal string "Closed" and the per-meal time
 * fields as "" (empty string); locations that only publish general hours (e.g. summer schedule)
 * report the per-meal fields as `null` instead. Both are treated as "no window". Exported so tests
 * can type their captured fixture against the real raw shape instead of `any`.
 *
 * Note: `new_location_hour.exceptions` looks like the place to read holiday/closure overrides
 * from, but holds only stale historical rows, not live data. The current closure notice lives in
 * the `locations` HTML blob instead; neither is read by this module today.
 */
export interface InfoV2Location {
  location_title: string;
  opening_hours: string;
  closing_hours: string;
  // Optional, not just nullable -- some live objects omit these keys entirely rather than
  // publishing `null`; windowOrNull already treats `undefined` the same as `null`/"" ("no window").
  breakfast_open_time?: string | null;
  breakfast_close_time?: string | null;
  lunch_open_time?: string | null;
  lunch_close_time?: string | null;
  dinner_open_time?: string | null;
  dinner_close_time?: string | null;
  // location_id is the foodpro-menu-ajax tid for this location, retail-only. Optional like the
  // per-meal time fields above -- a future capture that omits or mangles it must degrade
  // mapInfoV2's output to undefined, not throw.
  location_id?: number;
  breakfast_menu?: string | null;
  lunch_menu?: string | null;
  dinner_menu?: string | null;
  short_description_v2?: string | null;
  // `address` is an HTML blob (e.g. `"<p>121 Southwest Cir<br/>Amherst, MA 01003</p>"`, sometimes
  // `<br />` -- both forms seen); `map_address` is a bare "lat,long" string.
  address?: string | null;
  map_address?: string | null;
  accepted_payment?: string | null;
}

const TIME_PATTERN = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;

/** Builds a window from raw open/close strings, or null if either side is absent, "Closed", or not
 * a recognized "H:MM AM/PM" time -- the `locations` HTML blob elsewhere in this payload uses words
 * like "Midnight" for times, so that shape should degrade to "no window" rather than throw deep
 * inside currentMealPeriod/openStatus. */
function windowOrNull(open: string | null | undefined, close: string | null | undefined): TimeWindow | null {
  if (!open || !close) return null;
  if (!TIME_PATTERN.test(open.trim()) || !TIME_PATTERN.test(close.trim())) return null;
  return { openTime: open, closeTime: close };
}

// An empty/absent *_menu field means "no menu published for this meal here" -- null, same
// "falsy -> no data" convention windowOrNull uses for hours.
function stringOrNull(s: string | null | undefined): string | null {
  return s ? s : null;
}

// description/address/mapAddress/acceptedPayment are plain optional strings, not nullable -- an
// empty/absent raw value just means the field wasn't parsed off this object.
function stringOrUndefined(s: string | null | undefined): string | undefined {
  return s ? s : undefined;
}

/**
 * First line of get_infov2's `address` HTML blob (e.g. `"<p>121 Southwest Cir<br/>Amherst, MA
 * 01003</p>"` -> `"121 Southwest Cir"`) -- the second line is a hardcoded "UMass Amherst" caption
 * elsewhere, so it's deliberately discarded here. Splits on both `<br/>` and `<br />` and strips
 * the surrounding `<p>` tag; returns null rather than risking tag/entity soup leaking into the UI.
 */
export function parseStreetAddress(html: string | null | undefined): string | null {
  if (!html) return null;
  const withoutTags = html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
  const firstLine = withoutTags.split("\n")[0]?.trim();
  return firstLine ? firstLine : null;
}

/**
 * Validates get_infov2's `map_address` ("42.383790,-72.530519") before it's interpolated into a
 * Linking.openURL call. Accepts only `<sign>digits(.digits),<sign>digits(.digits)`; anything else
 * maps to null so the DIRECTIONS row can omit itself instead of handing a bad string to the OS.
 */
const MAP_ADDRESS_PATTERN = /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/;
export function parseMapAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return MAP_ADDRESS_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * The 4 commons' get_infov2 titles don't match DINING_HALLS.name exactly ("Worcester Commons" vs
 * "Berkshire Dining Commons" -- no consistent suffix), but every commons title starts with the hall
 * name and contains "Commons", while retail/café/Grab'N Go locations sharing a hall-name prefix
 * (e.g. "Worcester Café") don't.
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
        // get_infov2 has no late-night time fields at all -- always null here. currentMealPeriod/
        // openStatus still accept a hand-built latenight window so callers with another source for
        // it (or tests) can exercise the overnight math.
        latenight: null,
        general,
        address: parseStreetAddress(loc.address),
        mapAddress: parseMapAddress(loc.map_address),
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

/** GET /uapp/get_infov2. */
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
 * Builds a real Date for `time` on `now`'s local calendar day (+ `dayOffset` days). Uses local time
 * components, not `new Date(string)` -- that parses as UTC and can land on the wrong calendar day
 * under a negative-UTC-offset timezone. get_infov2's times are Eastern wall-clock with no offset
 * info in the feed; this assumes the runtime's local timezone is Eastern.
 */
function atLocalTime(now: Date, time: string, dayOffset = 0): Date {
  const { hour, minute } = parseTimeOfDay(time);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, minute, 0, 0);
}

/**
 * Resolves a window to concrete open/close Dates relative to `now`, and says whether `now` falls in
 * it. Half-open interval [open, close) -- exactly at close time is NOT contained. Windows where
 * close <= open cross midnight (e.g. "11:00 PM" - "1:00 AM"); both the occurrence starting today and
 * the one starting yesterday (whose tail can still cover `now` in the early morning) are checked.
 *
 * `valid: false` covers two malformed-window cases (only reachable via a hand-built TimeWindow, not
 * through get_infov2 -- windowOrNull screens these out there): openTime/closeTime that don't match
 * "H:MM AM/PM", and openTime === closeTime (which crossesMidnight's `<=` would otherwise treat as a
 * full 24h-open window). Both fall back to "no window" (closed).
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

/** UMass's own reference app labels meals using this fixed clock schedule whenever a hall has no
 * real per-meal times published (get_infov2's Summer Hours shape: a lone `general` window, no
 * breakfast/lunch/dinner) -- a static convention the app applies, not something derived from a
 * live per-hall/per-day feed. */
const STANDARD_MEAL_WINDOWS: Record<HallMealPeriod, TimeWindow> = {
  breakfast: { openTime: "7:00 AM", closeTime: "11:00 AM" },
  lunch: { openTime: "11:00 AM", closeTime: "4:30 PM" },
  dinner: { openTime: "4:30 PM", closeTime: "9:00 PM" },
  latenight: { openTime: "9:00 PM", closeTime: "12:00 AM" },
};

/** Formats a resolved Date back into get_infov2's own "H:MM AM/PM" wire format -- the inverse of
 * parseTimeOfDay, needed because effectiveMealWindow below clamps a synthesized window's Date
 * bounds and must hand back a TimeWindow (string times) to stay a drop-in replacement for
 * `hours[key]` everywhere it's read. */
export function formatTimeOfDay(date: Date): string {
  let hour = date.getHours();
  const minute = date.getMinutes();
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** The window actually governing `key` for `hours` right now: the hall's own published per-meal
 * window when UMass publishes one, otherwise the standard fallback above -- gated on `general`
 * independently confirming the hall is actually open right now, so a hall with no general window
 * either never gets a synthesized meal window.
 *
 * The synthesized window is clamped to `general`'s own resolved open/close, not returned as the raw
 * standard window -- otherwise a hall whose real published hours end earlier than a standard
 * boundary (e.g. general closes 1 PM but standard lunch runs to 4:30 PM) would report a closesAt
 * past when the hall is actually open. */
export function effectiveMealWindow(hours: DiningHallHours, key: HallMealPeriod, now: Date): TimeWindow | null {
  if (hours[key]) return hours[key];
  if (!hours.general) return null;
  const general = resolveWindow(now, hours.general);
  if (!general.contains) return null;
  const standard = resolveWindow(now, STANDARD_MEAL_WINDOWS[key]);
  if (!standard.valid) return null;
  const open = standard.open > general.open ? standard.open : general.open;
  const close = standard.close < general.close ? standard.close : general.close;
  if (open >= close) return null; // standard window and general don't actually overlap
  return { openTime: formatTimeOfDay(open), closeTime: formatTimeOfDay(close) };
}

/** Which specific meal (if any) `hours` is currently serving. "closed" covers both a hall with no
 * hours published today and a hall between meal windows (e.g. after breakfast, before lunch). */
export function currentMealPeriod(hours: DiningHallHours, now: Date): MealStatus {
  for (const { period, key } of MEAL_WINDOWS) {
    const window = effectiveMealWindow(hours, key, now);
    if (window && resolveWindow(now, window).contains) return period;
  }
  return "closed";
}

/** Whether the hall's doors are open right now -- broader than currentMealPeriod: true if ANY
 * published window covers `now`, including `general`. When more than one window covers `now`,
 * `closesAt` is the LATEST of their close times, not just the first window checked -- otherwise a
 * hall open until 9 PM generally would incorrectly report closing at breakfast's 10 AM. `closesAt`
 * also chains through contiguous/overlapping windows that don't themselves contain `now` (e.g.
 * breakfast 7-10 adjacent to lunch 10-2 reports closesAt 2 PM at 9 AM, not 10 AM). Windows that fail
 * to resolve are ignored entirely, contributing to neither closesAt nor opensAt. */
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
