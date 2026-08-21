import { nowLocalIso, todayIso } from "./date";

// TZ is pinned to America/New_York for the whole suite via mobile/package.json's `test` script
// (`TZ=America/New_York jest`) -- mutating `process.env.TZ` mid-test does NOT work (verified:
// V8/ICU reads it once at process start, so a `beforeEach`/in-test assignment is a silent no-op
// here), so the timezone these tests exercise has to be pinned at process start, not per-test.
// Run `TZ=America/New_York npx jest date.test.ts` directly if bypassing the npm script.
describe("nowLocalIso", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("date-prefixes with the LOCAL calendar day even when UTC has already rolled to the next day (issue #111)", () => {
    // 11:30 PM Eastern on Aug 20 == 3:30 AM UTC on Aug 21.
    jest.useFakeTimers().setSystemTime(new Date("2026-08-21T03:30:00.000Z"));

    expect(nowLocalIso()).toBe("2026-08-20T23:30:00.000");
    // The bug this guards against: `.toISOString()` would give the wrong, UTC-rolled day here.
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-08-21");
  });

  it("matches todayIso()'s date prefix at any time of day, not just near the UTC boundary", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-20T15:00:00.000Z")); // 11 AM Eastern, no rollover in play

    expect(nowLocalIso().slice(0, 10)).toBe(todayIso());
  });

  it("parses back as the same local wall-clock time (no timezone suffix -> local per Date parsing)", () => {
    const stamped = nowLocalIso(new Date(2026, 7, 20, 23, 15, 42, 123)); // Aug is month index 7
    expect(stamped).toBe("2026-08-20T23:15:42.123");
    expect(new Date(stamped).getHours()).toBe(23);
    expect(new Date(stamped).getMinutes()).toBe(15);
  });
});
