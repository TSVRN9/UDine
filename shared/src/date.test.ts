import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_ROLLOVER_HOUR, effectiveTodayIso, nowLocalIso, resolveMenuDate } from "./date.ts";
import { isoDateOf } from "./macros.ts";

const TODAY = "2026-08-19";

test("resolveMenuDate: absent date param falls back to today", () => {
  assert.equal(resolveMenuDate(null, TODAY), TODAY);
});

test("resolveMenuDate: empty date param falls back to today", () => {
  assert.equal(resolveMenuDate("", TODAY), TODAY);
});

test("resolveMenuDate: a past date falls back to today", () => {
  assert.equal(resolveMenuDate("2026-08-01", TODAY), TODAY);
});

test("resolveMenuDate: garbage input falls back to today", () => {
  assert.equal(resolveMenuDate("banana", TODAY), TODAY);
});

test("resolveMenuDate: an impossible month (13) falls back to today, not a lexicographic pass-through", () => {
  // Lexicographically "2026-13-99" > "2026-08-19", which is exactly the bug: an unbounded regex +
  // string compare lets this through and it renders as "Invalid Date" downstream.
  assert.equal(resolveMenuDate("2026-13-99", TODAY), TODAY);
});

test("resolveMenuDate: an impossible year/month/day falls back to today", () => {
  assert.equal(resolveMenuDate("9999-99-99", TODAY), TODAY);
});

test("resolveMenuDate: a valid future ISO date passes through unchanged", () => {
  assert.equal(resolveMenuDate("2026-08-20", TODAY), "2026-08-20");
});

// TZ is pinned to America/New_York for this whole package's test run via shared/package.json's
// `test` script (`TZ=America/New_York node ... --test ...`) -- see mobile/package.json's identical
// pin (mobile/src/lib/date.test.ts's header comment) for why it has to happen at process start, not
// mid-test: V8/ICU reads `TZ` once when the process boots, so a `process.env.TZ` assignment inside a
// test is a silent no-op. Run `TZ=America/New_York node --experimental-strip-types --test
// src/date.test.ts` directly if bypassing the npm script.
test("nowLocalIso: date-prefixes with the LOCAL calendar day even when UTC has already rolled to the next day (issues #111/#124)", () => {
  // 11:30 PM Eastern on Aug 20 == 3:30 AM UTC on Aug 21 -- the boundary both the mobile (#111) and
  // web (#124) bugs broke on. Passed in explicitly (nowLocalIso takes an optional Date) rather than
  // faking the system clock -- no fake-timer machinery needed to hit this boundary deterministically.
  const instant = new Date("2026-08-21T03:30:00.000Z");

  assert.equal(nowLocalIso(instant), "2026-08-20T23:30:00.000");
  // The bug this guards against: `.toISOString()` would give the wrong, UTC-rolled day here.
  assert.equal(instant.toISOString().slice(0, 10), "2026-08-21");
});

test("nowLocalIso: writer/reader seam -- its date prefix is what a same-instant local-day reader (isoDateOf) must agree it stamped (mutant-killing)", () => {
  // This is the web-side shape of the seam assertion PR #122's review demanded for mobile
  // (`nowLocalIso().slice(0, 10) === todayIso()`): without it, a mutant that reverts nowLocalIso to
  // `.toISOString()`-based stamping only breaks the test above (which asserts nowLocalIso's own
  // output). This one asserts the composed writer -> reader path a caller like
  // web/src/lib/indexedDbStorage.ts's getEntriesForDate actually exercises: isoDateOf(stamp) must
  // equal the LOCAL calendar day, not whatever day() UTC happens to think it is at the same instant.
  const instant = new Date("2026-08-21T03:30:00.000Z");
  const stamped = nowLocalIso(instant);

  assert.equal(isoDateOf(stamped), "2026-08-20");
  assert.notEqual(isoDateOf(stamped), instant.toISOString().slice(0, 10));
});

test("nowLocalIso: parses back as the same local wall-clock time (no timezone suffix -> local per Date parsing)", () => {
  const stamped = nowLocalIso(new Date(2026, 7, 20, 23, 15, 42, 123)); // Aug is month index 7
  assert.equal(stamped, "2026-08-20T23:15:42.123");
  assert.equal(new Date(stamped).getHours(), 23);
  assert.equal(new Date(stamped).getMinutes(), 15);
});

test("effectiveTodayIso: DEFAULT_ROLLOVER_HOUR is 2 AM", () => {
  assert.equal(DEFAULT_ROLLOVER_HOUR, 2);
});

test("effectiveTodayIso: 23:59 the night before is well before the rollover boundary -- same day it's stamped", () => {
  assert.equal(effectiveTodayIso(new Date(2026, 7, 20, 23, 59, 0, 0), DEFAULT_ROLLOVER_HOUR), "2026-08-20");
});

test("effectiveTodayIso: 00:01 -- just past midnight is still the day that's ending, not a new day", () => {
  assert.equal(effectiveTodayIso(new Date(2026, 7, 21, 0, 1, 0, 0), DEFAULT_ROLLOVER_HOUR), "2026-08-20");
});

test("effectiveTodayIso: 01:59 -- one minute before rollover is still the day that's ending", () => {
  assert.equal(effectiveTodayIso(new Date(2026, 7, 21, 1, 59, 0, 0), DEFAULT_ROLLOVER_HOUR), "2026-08-20");
});

test("effectiveTodayIso: 02:01 -- one minute past rollover is the new day", () => {
  assert.equal(effectiveTodayIso(new Date(2026, 7, 21, 2, 1, 0, 0), DEFAULT_ROLLOVER_HOUR), "2026-08-21");
});

test("effectiveTodayIso: pins the transition instant itself -- 01:59:59.999 is still the old day, 02:00:00.000 is already the new day", () => {
  assert.equal(effectiveTodayIso(new Date(2026, 7, 21, 1, 59, 59, 999), DEFAULT_ROLLOVER_HOUR), "2026-08-20");
  assert.equal(effectiveTodayIso(new Date(2026, 7, 21, 2, 0, 0, 0), DEFAULT_ROLLOVER_HOUR), "2026-08-21");
});

test("effectiveTodayIso: a rolloverHour other than the default is honored (not hardcoded to 2)", () => {
  assert.equal(effectiveTodayIso(new Date(2026, 7, 21, 3, 30, 0, 0), 4), "2026-08-20");
  assert.equal(effectiveTodayIso(new Date(2026, 7, 21, 4, 30, 0, 0), 4), "2026-08-21");
});

// DST ends in the US on the first Sunday of November -- Nov 1, 2026, 2:00 AM EDT falls back to
// 1:00 AM EST (an hour repeats; the local day is 25 hours long). Same technique as nowLocalIso's
// neighboring DST-adjacent tests (issues #111/#124): explicit local Date components, TZ pinned to
// America/New_York for the whole package test run (see header comment above). Note: on this
// particular (fall-back) day, a naive 24h-ms-subtraction implementation happens to land on the same
// calendar day as `Date.setDate(d - 1)`, so this assertion alone doesn't distinguish them -- see the
// spring-forward test below for that.
test("effectiveTodayIso: DST fall-back day (Nov 1, 2026) -- before rollover still resolves to Oct 31, after rollover resolves to Nov 1", () => {
  assert.equal(effectiveTodayIso(new Date(2026, 10, 1, 0, 30, 0, 0), DEFAULT_ROLLOVER_HOUR), "2026-10-31");
  assert.equal(effectiveTodayIso(new Date(2026, 10, 1, 3, 0, 0, 0), DEFAULT_ROLLOVER_HOUR), "2026-11-01");
});

// DST starts in the US on the second Sunday of March -- Mar 8-9, 2026, 2:00 AM EST springs forward
// to 3:00 AM EDT (an hour is skipped; the local day is 23 hours long). Unlike the fall-back day
// above, a naive 24h-ms-subtraction implementation gets this one wrong: subtracting exactly 24h
// from 00:30 local on the 23-hour day undershoots midnight and lands on Mar 7, not Mar 8. This
// proves `Date.setDate(d - 1)` -- not manual 24h-offset math -- is what keeps the day-before
// calculation correct on an irregular-length day.
test("effectiveTodayIso: DST spring-forward day (Mar 9, 2026) -- before rollover resolves to Mar 8, not two days back", () => {
  assert.equal(effectiveTodayIso(new Date(2026, 2, 9, 0, 30, 0, 0), DEFAULT_ROLLOVER_HOUR), "2026-03-08");
});
