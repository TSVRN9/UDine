// Red-first tests for the Deno-side hours helper (issue #95) -- a deliberately smaller duplicate of
// shared/src/hours.ts's mapping + open-status math (see hours.ts's own top comment for why this
// can't just import @udine/shared). Covers: commons-name matching against a live-shaped get_infov2
// fixture, and currentlyOpenUntil()'s same-day window containment + Eastern "now" handling.
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/_shared/hours.test.ts

import { mapHallHours, currentlyOpenUntil, windowCloseLabel, hallName, HALL_TIDS, type InfoV2Location } from "./hours.ts";

/** Temporarily makes `new Date()` (no args) resolve to a fixed instant, then restores it. */
function withFixedNow(iso: string, fn: () => void) {
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
    fn();
  } finally {
    globalThis.Date = RealDate;
  }
}

// No general window here (opening_hours/closing_hours "Closed") -- a real get_infov2 hall
// publishes EITHER a general all-day window (off-semester schedule, see #88's live capture) OR
// per-meal windows (semester schedule), not both spanning the same day; a separate fixture below
// covers the "two windows both contain now" case explicitly.
const HAMPSHIRE: InfoV2Location = {
  location_title: "Hampshire Dining Commons",
  opening_hours: "Closed",
  closing_hours: "Closed",
  breakfast_open_time: null,
  breakfast_close_time: null,
  lunch_open_time: "11:00 AM",
  lunch_close_time: "02:30 PM",
  dinner_open_time: "05:00 PM",
  dinner_close_time: "08:00 PM",
};

const WORCESTER_CAFE: InfoV2Location = {
  location_title: "Worcester Café",
  opening_hours: "08:00 AM",
  closing_hours: "06:00 PM",
};

const WORCESTER_COMMONS: InfoV2Location = {
  location_title: "Worcester Commons",
  opening_hours: "Closed",
  closing_hours: "Closed",
};

Deno.test("mapHallHours: matches a commons title to its hall tid", () => {
  const map = mapHallHours([HAMPSHIRE, WORCESTER_COMMONS]);
  if (!map.has(3)) throw new Error("expected Hampshire (tid 3) to be mapped");
  if (!map.has(1)) throw new Error("expected Worcester Commons to map to hall tid 1");
});

Deno.test("mapHallHours: a café/retail location sharing a hall's name prefix does NOT match (needs 'Commons' too)", () => {
  const map = mapHallHours([WORCESTER_CAFE]);
  if (map.has(1)) throw new Error("Worcester Café alone should not have matched hall tid 1");
});

Deno.test("mapHallHours: 'Closed' opening/closing hours produce no general window", () => {
  const map = mapHallHours([HAMPSHIRE, WORCESTER_CAFE, WORCESTER_COMMONS]);
  const worcester = map.get(1);
  if (!worcester) throw new Error("expected Worcester (tid 1) to be mapped even though it's closed");
  if (worcester.general !== null) throw new Error(`expected no general window for a 'Closed' commons, got ${JSON.stringify(worcester.general)}`);
});

Deno.test("currentlyOpenUntil: inside a published window reports that window's close time", () => {
  const map = mapHallHours([HAMPSHIRE]);
  const hours = map.get(3)!;
  // Noon Eastern (EST, UTC-5, in early January) falls inside the lunch window (11:00 AM - 2:30 PM).
  withFixedNow("2026-01-15T17:00:00.000Z", () => {
    const result = currentlyOpenUntil(hours);
    if (result !== "2:30 PM") throw new Error(`expected "2:30 PM", got ${JSON.stringify(result)}`);
  });
});

Deno.test("currentlyOpenUntil: between windows (after lunch, before dinner) reports no hours line", () => {
  const map = mapHallHours([HAMPSHIRE]);
  const hours = map.get(3)!;
  // 3:00 PM Eastern -- after lunch closes (2:30 PM), before dinner opens (5:00 PM).
  withFixedNow("2026-01-15T20:00:00.000Z", () => {
    const result = currentlyOpenUntil(hours);
    if (result !== null) throw new Error(`expected null (closed between meals), got ${JSON.stringify(result)}`);
  });
});

Deno.test("currentlyOpenUntil: exactly at a window's close time is NOT contained (half-open interval)", () => {
  const map = mapHallHours([HAMPSHIRE]);
  const hours = map.get(3)!;
  // 2:30 PM Eastern exactly -- the boundary instant lunch's window excludes.
  withFixedNow("2026-01-15T19:30:00.000Z", () => {
    const result = currentlyOpenUntil(hours);
    if (result !== null) throw new Error(`expected null at the exact close boundary, got ${JSON.stringify(result)}`);
  });
});

Deno.test("currentlyOpenUntil: midnight Eastern doesn't misparse as hour 24", () => {
  // Regression for the Intl hour12:false "24" trap -- a hall with a window open through midnight
  // would otherwise throw or silently miscompute. No real get_infov2 hall does this today (no
  // latenight fields, per hours.ts's own doc comment), but the Eastern-now computation itself must
  // not throw at the midnight instant regardless of what windows are published.
  const map = mapHallHours([HAMPSHIRE]);
  const hours = map.get(3)!;
  withFixedNow("2026-01-15T05:00:00.000Z", () => {
    // Midnight Eastern (EST, UTC-5) -- outside every published window, but must not throw.
    const result = currentlyOpenUntil(hours);
    if (result !== null) throw new Error(`expected null at midnight (outside all windows), got ${JSON.stringify(result)}`);
  });
});

Deno.test("currentlyOpenUntil: two windows both containing now report the LATEST close", () => {
  // A general window overlapping dinner (e.g. semester feed publishing both) -- open until the
  // later of the two, not just the first window checked.
  const map = mapHallHours([
    { ...HAMPSHIRE, opening_hours: "07:00 AM", closing_hours: "09:00 PM" },
  ]);
  const hours = map.get(3)!;
  withFixedNow("2026-01-16T00:00:00.000Z", () => {
    // 7:00 PM Eastern -- inside both dinner (5-8pm) and general (7am-9pm).
    const result = currentlyOpenUntil(hours);
    if (result !== "9:00 PM") throw new Error(`expected the later close "9:00 PM", got ${JSON.stringify(result)}`);
  });
});

Deno.test("windowCloseLabel: normalizes a leading-zero close time and strips it", () => {
  const label = windowCloseLabel({ openTime: "11:00 AM", closeTime: "02:30 PM" });
  if (label !== "2:30 PM") throw new Error(`expected "2:30 PM", got ${JSON.stringify(label)}`);
});

Deno.test("windowCloseLabel: null window or unparseable close time yields null", () => {
  if (windowCloseLabel(null) !== null) throw new Error("expected null for a null window");
  if (windowCloseLabel({ openTime: "11:00 AM", closeTime: "Midnight" }) !== null) {
    throw new Error("expected null for an unparseable close time");
  }
});

Deno.test("hallName/HALL_TIDS: known tids resolve, unknown tid falls back instead of throwing", () => {
  if (HALL_TIDS.length !== 4) throw new Error(`expected 4 hall tids, got ${HALL_TIDS.length}`);
  if (hallName(3) !== "Hampshire") throw new Error(`expected "Hampshire", got ${JSON.stringify(hallName(3))}`);
  if (hallName(99) !== "hall 99") throw new Error(`expected fallback "hall 99", got ${JSON.stringify(hallName(99))}`);
});
