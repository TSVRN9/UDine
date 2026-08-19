import assert from "node:assert/strict";
import { test } from "node:test";
import { currentMealPeriod, mapInfoV2, openStatus, type InfoV2Location } from "./hours.ts";
import type { DiningHallHours, TimeWindow } from "./types.ts";

// Real sample captured from GET https://www.umassdining.com/uapp/get_infov2, 2026-08-19 (curl -L,
// see docs/apk-reverse-engineering.md). Trimmed to the fields this module reads and to the objects
// needed to exercise the mapping: the 4 commons (3 in the "Closed" summer-schedule shape, 1 --
// Hampshire -- open with only general hours, no per-meal breakdown) plus 3 retail locations,
// including "Worcester Café" specifically -- it shares the "Worcester" prefix with "Worcester
// Commons" but isn't a commons, so it's the real-data case that makes the name-matching rule
// (startsWith + "Commons") load-bearing rather than accidentally passing on a 2-item retail sample.
// `satisfies InfoV2Location[]` (not `as`) so tsc catches this sample drifting from the real raw shape.
// Full response is 40 objects.
const REAL_INFOV2_SAMPLE = [
  {
    location_title: "Berkshire Dining Commons",
    opening_hours: "Closed",
    closing_hours: "Closed",
    breakfast_open_time: "",
    breakfast_close_time: "",
    lunch_open_time: "",
    lunch_close_time: "",
    dinner_open_time: "",
    dinner_close_time: "",
  },
  {
    location_title: "Worcester Commons",
    opening_hours: "Closed",
    closing_hours: "Closed",
    breakfast_open_time: "",
    breakfast_close_time: "",
    lunch_open_time: "",
    lunch_close_time: "",
    dinner_open_time: "",
    dinner_close_time: "",
  },
  {
    location_title: "Franklin Dining Commons",
    opening_hours: "Closed",
    closing_hours: "Closed",
    breakfast_open_time: "",
    breakfast_close_time: "",
    lunch_open_time: "",
    lunch_close_time: "",
    dinner_open_time: "",
    dinner_close_time: "",
  },
  {
    location_title: "Hampshire Dining Commons",
    opening_hours: "07:00 AM",
    closing_hours: "09:00 PM",
    breakfast_open_time: null,
    breakfast_close_time: null,
    lunch_open_time: null,
    lunch_close_time: null,
    dinner_open_time: null,
    dinner_close_time: null,
  },
  {
    location_title: "Roots Café",
    opening_hours: "Closed",
    closing_hours: "Closed",
    breakfast_open_time: "",
    breakfast_close_time: "",
    lunch_open_time: "",
    lunch_close_time: "",
    dinner_open_time: "",
    dinner_close_time: "",
  },
  {
    location_title: "Paciugo",
    opening_hours: "11:00 AM",
    closing_hours: "06:00 PM",
    breakfast_open_time: null,
    breakfast_close_time: null,
    lunch_open_time: null,
    lunch_close_time: null,
    dinner_open_time: null,
    dinner_close_time: null,
  },
  {
    location_title: "Worcester Café",
    opening_hours: "Closed",
    closing_hours: "Closed",
    breakfast_open_time: "",
    breakfast_close_time: "",
    lunch_open_time: "",
    lunch_close_time: "",
    dinner_open_time: "",
    dinner_close_time: "",
  },
] satisfies InfoV2Location[];

// --- mapping (mapInfoV2) ---

test("mapInfoV2 keys the 4 commons to DINING_HALLS tids by name", () => {
  const feed = mapInfoV2(REAL_INFOV2_SAMPLE);
  assert.deepEqual(
    feed.halls.map((h) => h.hallTid).sort((a, b) => a - b),
    [1, 2, 3, 4],
  );
  // Worcester Commons -> tid 1 per DINING_HALLS -- also confirms real location_ids in the live
  // feed (Worcester=1, Franklin=2, Hampshire=3, Berkshire=4) agree with our own tid assignment.
  const worcester = feed.halls.find((h) => h.hallTid === 1);
  assert.equal(worcester?.general, null); // "Closed" (summer schedule)
});

test("mapInfoV2 does not match 'Worcester Café' as the Worcester commons, despite sharing the name prefix", () => {
  const feed = mapInfoV2(REAL_INFOV2_SAMPLE);
  assert.equal(feed.halls.length, 4); // not 5 -- Worcester Café must not have matched a hall
  assert.ok(feed.retail.some((r) => r.name === "Worcester Café"));
});

test("mapInfoV2 falls back to general hours when a hall has no per-meal breakdown published", () => {
  const feed = mapInfoV2(REAL_INFOV2_SAMPLE);
  const hampshire = feed.halls.find((h) => h.hallTid === 3);
  assert.deepEqual(hampshire?.general, { openTime: "07:00 AM", closeTime: "09:00 PM" });
  assert.equal(hampshire?.breakfast, null);
  assert.equal(hampshire?.lunch, null);
  assert.equal(hampshire?.dinner, null);
});

test("mapInfoV2 puts non-commons locations (cafés/retail) in retail, not halls", () => {
  const feed = mapInfoV2(REAL_INFOV2_SAMPLE);
  assert.equal(feed.halls.length, 4);
  assert.equal(feed.retail.length, 3);
  const paciugo = feed.retail.find((r) => r.name === "Paciugo");
  assert.deepEqual(paciugo?.hours, { openTime: "11:00 AM", closeTime: "06:00 PM" });
  const roots = feed.retail.find((r) => r.name === "Roots Café");
  assert.equal(roots?.hours, null);
});

// --- time math (currentMealPeriod / openStatus) ---
// Constructed hours -- get_infov2 itself has no late-night time fields (see hours.ts's mapInfoV2
// doc), so the overnight/late-night boundary cases below exercise currentMealPeriod/openStatus
// directly rather than through the mapping.

function hallWith(windows: Partial<Omit<DiningHallHours, "hallTid">>): DiningHallHours {
  return { hallTid: 1, breakfast: null, lunch: null, dinner: null, latenight: null, general: null, ...windows };
}

const LUNCH: TimeWindow = { openTime: "11:00 AM", closeTime: "2:00 PM" };
const LATE_NIGHT_OVERNIGHT: TimeWindow = { openTime: "11:00 PM", closeTime: "1:00 AM" };

test("currentMealPeriod returns the meal whose window contains now", () => {
  const hall = hallWith({ lunch: LUNCH });
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 12, 0)), "lunch");
});

test("currentMealPeriod returns closed exactly at the close time (half-open interval)", () => {
  const hall = hallWith({ lunch: LUNCH });
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 14, 0)), "closed");
  // one minute before close is still lunch
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 13, 59)), "lunch");
});

test("currentMealPeriod returns closed for a hall with no hours published at all", () => {
  const hall = hallWith({});
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 12, 0)), "closed");
});

test("currentMealPeriod returns closed between meal windows even though the hall serves other meals", () => {
  const hall = hallWith({ lunch: LUNCH, dinner: { openTime: "5:00 PM", closeTime: "8:00 PM" } });
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 15, 0)), "closed");
});

test("currentMealPeriod resolves an overnight late-night window on the starting night", () => {
  const hall = hallWith({ latenight: LATE_NIGHT_OVERNIGHT });
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 23, 30)), "latenight");
});

test("currentMealPeriod resolves an overnight late-night window in the next-day early-morning tail", () => {
  const hall = hallWith({ latenight: LATE_NIGHT_OVERNIGHT });
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 20, 0, 30)), "latenight");
});

test("currentMealPeriod returns closed exactly at the overnight window's close time", () => {
  const hall = hallWith({ latenight: LATE_NIGHT_OVERNIGHT });
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 20, 1, 0)), "closed");
});

test("openStatus reports open with closesAt during a window", () => {
  const hall = hallWith({ lunch: LUNCH });
  const status = openStatus(hall, new Date(2026, 7, 19, 12, 0));
  assert.equal(status.open, true);
  assert.deepEqual(status.open ? status.closesAt : null, new Date(2026, 7, 19, 14, 0));
});

test("openStatus reports closed with opensAt for the next upcoming window today", () => {
  const hall = hallWith({ lunch: LUNCH, dinner: { openTime: "5:00 PM", closeTime: "8:00 PM" } });
  const status = openStatus(hall, new Date(2026, 7, 19, 15, 0));
  assert.equal(status.open, false);
  assert.deepEqual(!status.open ? status.opensAt : null, new Date(2026, 7, 19, 17, 0));
});

test("openStatus reports closed with opensAt null for a hall closed all day", () => {
  const hall = hallWith({});
  const status = openStatus(hall, new Date(2026, 7, 19, 12, 0));
  assert.equal(status.open, false);
  assert.equal(!status.open ? status.opensAt : "unreachable", null);
});

test("openStatus reports the LATEST close among multiple windows that all cover now, not the first one checked", () => {
  // e.g. a semester feed publishing both a meal window and general hours for an overlapping span --
  // closesAt must be the actual latest closing time, not whichever window happens first in the
  // internal [breakfast, lunch, dinner, latenight, general] check order.
  const hall = hallWith({ lunch: LUNCH, general: { openTime: "07:00 AM", closeTime: "09:00 PM" } });
  const status = openStatus(hall, new Date(2026, 7, 19, 12, 0));
  assert.equal(status.open, true);
  assert.deepEqual(status.open ? status.closesAt : null, new Date(2026, 7, 19, 21, 0));
});

test("openStatus falls back to general hours when there's no per-meal breakdown", () => {
  const hall = hallWith({ general: { openTime: "07:00 AM", closeTime: "09:00 PM" } });
  const status = openStatus(hall, new Date(2026, 7, 19, 10, 0));
  assert.equal(status.open, true);
  assert.deepEqual(status.open ? status.closesAt : null, new Date(2026, 7, 19, 21, 0));
});

// --- hardening follow-ups from PR #98's review (issue #100) ---

test("openStatus chains into a contiguous adjacent window instead of reporting the first window's close (issue #100 item 1)", () => {
  // Breakfast 7-10 adjacent to lunch 10-2: at 9 AM the hall is still open straight through lunch,
  // so closesAt must be 2 PM (lunch's close), not 10 AM (breakfast's close) -- unreachable through
  // mapInfoV2 today (open locations publish a whole-day general window instead of adjacent per-meal
  // windows) but real the moment a latenight/per-meal source with back-to-back windows is injected.
  const BREAKFAST: TimeWindow = { openTime: "7:00 AM", closeTime: "10:00 AM" };
  const CONTIGUOUS_LUNCH: TimeWindow = { openTime: "10:00 AM", closeTime: "2:00 PM" };
  const hall = hallWith({ breakfast: BREAKFAST, lunch: CONTIGUOUS_LUNCH });
  const status = openStatus(hall, new Date(2026, 7, 19, 9, 0));
  assert.equal(status.open, true);
  assert.deepEqual(status.open ? status.closesAt : null, new Date(2026, 7, 19, 14, 0));
});

test("openStatus does not throw on a hand-built window using a non-standard time word like 'Midnight', and treats it as no window (issue #100 item 3)", () => {
  // Hand-built windows (tests, or a future latenight source) bypass windowOrNull's TIME_PATTERN
  // check, which is the only thing currently protecting parseTimeOfDay from throwing.
  const hall = hallWith({ latenight: { openTime: "11:00 PM", closeTime: "Midnight" } });
  const status = openStatus(hall, new Date(2026, 7, 19, 23, 30));
  assert.equal(status.open, false);
  assert.equal(status.open ? "unreachable" : status.opensAt, null);
});

test("currentMealPeriod does not throw on a hand-built window using a non-standard time word like 'Midnight' (issue #100 item 3)", () => {
  const hall = hallWith({ latenight: { openTime: "11:00 PM", closeTime: "Midnight" } });
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 23, 30)), "closed");
});

test("openStatus treats openTime === closeTime as closed, not a 24h-open window (issue #100 item 4)", () => {
  // crossesMidnight uses <=, so an equal open/close time would otherwise resolve to a full 24h
  // "open" span. That's almost certainly a data error, not a real close-at-open-time schedule --
  // pinned fallback: treat it as no window (closed) rather than open all day.
  const hall = hallWith({ general: { openTime: "09:00 AM", closeTime: "09:00 AM" } });
  const status = openStatus(hall, new Date(2026, 7, 19, 12, 0));
  assert.equal(status.open, false);
  assert.equal(status.open ? "unreachable" : status.opensAt, null);
});

// Real capture: 19 of the 40 live get_infov2 objects omit the six per-meal fields entirely rather
// than publishing them as null (issue #100 item 2) -- e.g. some retail locations. `InfoV2Location`
// currently types them as required, so this fixture fails to typecheck against it even though
// mapInfoV2/windowOrNull already handle `undefined` safely at runtime (same "falsy" branch as `""`
// and `null`).
const INFOV2_MISSING_MEAL_FIELDS = [
  {
    location_title: "Paciugo",
    opening_hours: "11:00 AM",
    closing_hours: "06:00 PM",
  },
] satisfies InfoV2Location[];

test("mapInfoV2 handles a fixture object that omits the six per-meal fields entirely, not just sets them null (issue #100 item 2)", () => {
  const feed = mapInfoV2(INFOV2_MISSING_MEAL_FIELDS);
  assert.deepEqual(feed.retail[0]?.hours, { openTime: "11:00 AM", closeTime: "06:00 PM" });
});
