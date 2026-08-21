// Deno-side duplicate of the parts of shared/src/hours.ts (#88) needed for push copy (#95):
// matching get_infov2 locations to our 4 hall tids, and "is this hall open right now, until when".
// Deliberately NOT importing @udine/shared -- it's a local workspace package, not published
// anywhere Deno's npm:/jsr: resolvers could reach (same reasoning already documented in
// check-favorited-foods/index.ts for HALL_NAMES and the dish-name parser).
//
// This is intentionally a much smaller subset than shared/src/hours.ts: no Date-object windows, no
// midnight-crossing/chaining (see currentlyOpenUntil's ponytail note), no currentMealPeriod (the
// caller gets meal period for free from foodpro-menu-ajax's own response keys -- see
// check-favorited-foods/index.ts). Everything here operates on minutes-since-midnight integers
// instead of Date objects, since the Edge Runtime's local clock is UTC (not Eastern, unlike the
// mobile/web deployment targets shared/src/hours.ts assumes) -- Eastern "now" is derived via Intl,
// the same technique check-favorited-foods/index.ts already uses for its date math.

export interface InfoV2Location {
  location_title: string;
  opening_hours: string;
  closing_hours: string;
  breakfast_open_time?: string | null;
  breakfast_close_time?: string | null;
  lunch_open_time?: string | null;
  lunch_close_time?: string | null;
  dinner_open_time?: string | null;
  dinner_close_time?: string | null;
}

export type TimeWindow = { openTime: string; closeTime: string };

export interface HallHours {
  hallTid: number;
  breakfast: TimeWindow | null;
  lunch: TimeWindow | null;
  dinner: TimeWindow | null;
  general: TimeWindow | null;
}

const HALLS = [
  { tid: 1, name: "Worcester" },
  { tid: 2, name: "Franklin" },
  { tid: 3, name: "Hampshire" },
  { tid: 4, name: "Berkshire" },
] as const;

/** Also the single source of the hall tid/name table for check-favorited-foods and send-ping-push
 * (folded in here rather than a third _shared module -- get_infov2 matching needs this table
 * anyway). See docs/apk-reverse-engineering.md for how these 4 tids were confirmed. */
export const HALL_TIDS: number[] = HALLS.map((h) => h.tid);
export function hallName(hallTid: number): string {
  return HALLS.find((h) => h.tid === hallTid)?.name ?? `hall ${hallTid}`;
}

const TIME_PATTERN = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;

/** Builds a window from raw open/close strings, or null if either side is absent, "Closed", or not
 * a recognized "H:MM AM/PM" time -- mirrors shared/src/hours.ts's windowOrNull. */
function windowOrNull(open: string | null | undefined, close: string | null | undefined): TimeWindow | null {
  if (!open || !close) return null;
  if (!TIME_PATTERN.test(open.trim()) || !TIME_PATTERN.test(close.trim())) return null;
  return { openTime: open.trim(), closeTime: close.trim() };
}

/** The 4 commons' get_infov2 titles start with the hall name and contain "Commons"; nothing else in
 * the feed does (cafés/Grab'n Go sharing the same name prefix don't) -- verified live in #88. */
function matchesHall(locationTitle: string, hallName: string): boolean {
  return locationTitle.startsWith(hallName) && locationTitle.includes("Commons");
}

/** Maps the raw get_infov2 array to per-hall-tid hours, skipping every non-commons (café/retail)
 * location -- this module only ever needs the 4 dining halls. */
export function mapHallHours(data: InfoV2Location[]): Map<number, HallHours> {
  const map = new Map<number, HallHours>();
  for (const loc of data) {
    const hall = HALLS.find((h) => matchesHall(loc.location_title, h.name));
    if (!hall) continue;
    map.set(hall.tid, {
      hallTid: hall.tid,
      breakfast: windowOrNull(loc.breakfast_open_time, loc.breakfast_close_time),
      lunch: windowOrNull(loc.lunch_open_time, loc.lunch_close_time),
      dinner: windowOrNull(loc.dinner_open_time, loc.dinner_close_time),
      general: windowOrNull(loc.opening_hours, loc.closing_hours),
    });
  }
  return map;
}

/** "H:MM AM/PM" -> minutes since midnight, or null if unparseable. */
function parseTimeOfDay(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(m[2]);
}

/** minutes since midnight -> "H:MM AM/PM", no leading zero -- normalizes get_infov2's inconsistent
 * raw formatting ("07:00 AM" in some responses, "7:00 AM" in others) to one display form. */
function minutesToLabel(totalMinutes: number): string {
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

/** Normalizes a window's raw closeTime string (whatever format get_infov2 sent) to a consistent
 * "H:MM AM/PM" display label, or null if it doesn't parse. Used for the food-sighting copy's
 * per-meal "served until <time>" clause, which -- unlike currentlyOpenUntil -- doesn't need to know
 * whether the window contains "now": the caller already knows which meal the dish was listed under
 * today (from foodpro-menu-ajax's own response keys), so this just needs that meal's close time. */
export function windowCloseLabel(window: TimeWindow | null): string | null {
  if (!window) return null;
  const close = parseTimeOfDay(window.closeTime);
  return close === null ? null : minutesToLabel(close);
}

/** Eastern "now" as minutes since midnight. hourCycle: "h23" avoids Intl's hour12:false quirk of
 * returning "24" for midnight, which would otherwise misparse as hour 24 instead of 0. */
function easternMinutesNow(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return (get("hour") % 24) * 60 + get("minute");
}

/**
 * Whether the hall is open right now, and if so until when -- null when closed (no published window
 * contains this instant) or when no window resolves at all. When more than one window contains now
 * (e.g. a semester feed publishing both a meal window and general hours for the same span), reports
 * the LATEST close among them, matching shared/src/hours.ts's openStatus.
 *
 * ponytail: same-day window containment only -- no midnight-crossing/chaining like
 * shared/src/hours.ts's resolveWindow (a window where close <= open is treated as unparseable and
 * skipped, same as shared/src/hours.ts's own "openTime === closeTime" trust-boundary fallback).
 * get_infov2 has no latenight fields at all (see shared/src/hours.ts's own doc comment) -- no real
 * hall's published window crosses midnight today. Upgrade path: port resolveWindow's
 * crossesMidnight handling here if a genuine overnight window shows up server-side.
 */
export function currentlyOpenUntil(hours: HallHours): string | null {
  const now = easternMinutesNow();
  const windows = [hours.breakfast, hours.lunch, hours.dinner, hours.general].filter((w): w is TimeWindow => w !== null);

  let closeMinutes: number | null = null;
  for (const w of windows) {
    const open = parseTimeOfDay(w.openTime);
    const close = parseTimeOfDay(w.closeTime);
    if (open === null || close === null || close <= open) continue;
    if (now >= open && now < close && (closeMinutes === null || close > closeMinutes)) {
      closeMinutes = close;
    }
  }
  return closeMinutes === null ? null : minutesToLabel(closeMinutes);
}
