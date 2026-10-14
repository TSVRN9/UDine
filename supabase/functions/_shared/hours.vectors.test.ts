// Runs shared/vectors/hours.json against the Deno hours copy. Covers kinds map_info_v2 (halls only;
// retail, address and mapAddress are not mapped here) and status (only the open/closed + closing time:
// Deno has no latenight, no effective-window synthesis, no opensAt, no mealPeriod). street_address
// and map_address are not covered: hours.ts has no address handling.
//
// Run (repo root): deno test --node-modules-dir=none --allow-env --allow-read=shared/vectors supabase/functions/_shared/hours.vectors.test.ts
import { currentlyOpenUntil, mapHallHours, type HallHours } from "./hours.ts";
import { defineVectorTests, same } from "./testing/vectors.ts";

// Cases where hours.ts disagrees with the vector. Not fixed here: owner decides which side is right.
const KNOWN_DIVERGENT: Record<string, string> = {
  "contiguous breakfast/lunch plus dinner @ 2026-09-15 07:00 America/New_York": "TS chains back-to-back meal windows into one open stretch (closes 2 PM); Deno reports only the window containing now (10:30 AM)",
  "contiguous breakfast/lunch plus dinner @ 2026-09-15 09:00 America/New_York": "TS chains back-to-back meal windows into one open stretch (closes 2 PM); Deno reports only the window containing now (10:30 AM)",
  "general overnight 7 AM to 1 AM @ 2026-09-15 00:30 America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "general overnight 7 AM to 1 AM @ 2026-09-15 07:00 America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "general overnight 7 AM to 1 AM @ 2026-09-15 09:00 America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "general overnight 7 AM to 1 AM @ 2026-09-15 10:30 America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "general overnight 7 AM to 1 AM @ 2026-09-15 11:00 America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "general overnight 7 AM to 1 AM @ 2026-09-15 12:00 America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "general overnight 7 AM to 1 AM @ 2026-09-15 13:00 America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "general overnight 7 AM to 1 AM @ 2026-09-15 14:00 America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "general overnight 7 AM to 1 AM @ 2026-09-15 16:30 America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "general overnight 7 AM to 1 AM @ 2026-09-15 17:00 America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "general overnight 7 AM to 1 AM @ 2026-09-15 20:59 America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "general overnight 7 AM to 1 AM @ 2026-09-15 21:00 America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "general overnight 7 AM to 1 AM @ 2026-09-15 23:00 America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "general overnight 7 AM to 1 AM @ 2026-09-15 23:59 America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "dinner plus overnight late night 11 PM-1 AM @ 2026-09-15 00:30 America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "dinner plus overnight late night 11 PM-1 AM @ 2026-09-15 23:00 America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "dinner plus overnight late night 11 PM-1 AM @ 2026-09-15 23:59 America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "overlapping lunch 11-3 and dinner 2-8 @ 2026-09-15 11:00 America/New_York": "TS chains overlapping meal windows (closes 8 PM); Deno reports the latest close among windows containing now (3 PM)",
  "overlapping lunch 11-3 and dinner 2-8 @ 2026-09-15 12:00 America/New_York": "TS chains overlapping meal windows (closes 8 PM); Deno reports the latest close among windows containing now (3 PM)",
  "overlapping lunch 11-3 and dinner 2-8 @ 2026-09-15 13:00 America/New_York": "TS chains overlapping meal windows (closes 8 PM); Deno reports the latest close among windows containing now (3 PM)",
  "general overnight 7 AM to 1 AM @ 2026-03-08T00:30:00-05:00 (DST) America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "general overnight 7 AM to 1 AM @ 2026-03-08T12:00:00-04:00 (DST) America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "general overnight 7 AM to 1 AM @ 2026-11-01T00:30:00-04:00 (DST) America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "general overnight 7 AM to 1 AM @ 2026-11-01T12:00:00-05:00 (DST) America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "dinner plus overnight late night 11 PM-1 AM @ 2026-03-08T00:30:00-05:00 (DST) America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
  "dinner plus overnight late night 11 PM-1 AM @ 2026-11-01T00:30:00-04:00 (DST) America/New_York": "window crosses midnight (closes 1 AM): Deno skips any window with close <= open, reports null (documented ponytail in hours.ts)",
};

function withFixedNow<T>(iso: string, fn: () => T): T {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor() {
      super(iso);
    }
    static override now() {
      return new RealDate(iso).getTime();
    }
  }
  // deno-lint-ignore no-explicit-any
  globalThis.Date = FixedDate as any;
  try {
    return fn();
  } finally {
    globalThis.Date = RealDate;
  }
}

const eastern = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true });
/** UTC instant -> "H:MM AM/PM" Eastern, the label form currentlyOpenUntil returns. */
const label = (utc: string) => eastern.format(new Date(utc)).replace(/ /g, " ");

const pick = (h: HallHours) => ({ hallTid: h.hallTid, breakfast: h.breakfast, lunch: h.lunch, dinner: h.dinner, general: h.general });

defineVectorTests("hours.ts", "hours.json", ["map_info_v2", "status"], (c) => {
  if (c.kind === "map_info_v2") {
    const want = new Map<number, ReturnType<typeof pick>>();
    for (const h of c.expected.halls) want.set(h.hallTid, pick(h));
    const got = mapHallHours(c.input);
    const sorted = (m: Map<number, unknown>) => [...m.entries()].sort((a, b) => a[0] - b[0]);
    return same(sorted(got), sorted(want)) ? null : `expected ${JSON.stringify(sorted(want))}, got ${JSON.stringify(sorted(got))}`;
  }
  const { hours, now } = c.input;
  const open = c.expected.openStatus;
  const want = open.open ? label(open.closesAt) : null;
  const got = withFixedNow(now, () => currentlyOpenUntil(hours));
  return got === want ? null : `expected ${want}, got ${got}`;
}, KNOWN_DIVERGENT);
