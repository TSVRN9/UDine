import { easternTodayIso, effectiveToday, nowLocalIso, todayIso } from "./date";

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
    // The writer/reader seam itself: a stamped entry's date prefix must match what the reader
    // (todayIso(), used by both YouPane's filter and SqliteLogStorage's LIKE) considers "today" at
    // this same instant. Without this assertion, reverting todayIso() to a UTC-based
    // implementation survives every other test in this file -- it doesn't touch nowLocalIso at all.
    expect(nowLocalIso().slice(0, 10)).toBe(todayIso());
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

describe("todayIso", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  // The brief's core acceptance criterion: a menu check/snack log at 12:30 AM still resolves to
  // the day that's ending (Late Night), not a brand-new day -- todayIso() is now routed through
  // @udine/shared's effectiveTodayIso/DEFAULT_ROLLOVER_HOUR instead of a bare `new Date()`.
  it("at 12:30 AM local, still resolves to the prior day (Late Night's day, not a new one)", () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 21, 0, 30, 0, 0)); // Aug 21, 12:30 AM
    expect(todayIso()).toBe("2026-08-20");
  });

  it("at 2:30 AM local, resolves to the new day (past the rollover boundary)", () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 21, 2, 30, 0, 0)); // Aug 21, 2:30 AM
    expect(todayIso()).toBe("2026-08-21");
  });

  it("at 11 AM local (nowhere near the boundary), resolves to the same calendar day as before", () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 20, 11, 0, 0, 0));
    expect(todayIso()).toBe("2026-08-20");
  });
});

describe("effectiveToday", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns a Date for the prior calendar day when now is before the rollover hour", () => {
    const result = effectiveToday(new Date(2026, 7, 21, 0, 30, 0, 0));
    expect(result.toDateString()).toBe(new Date(2026, 7, 20).toDateString());
  });

  it("returns a Date for the same calendar day once past the rollover hour", () => {
    const result = effectiveToday(new Date(2026, 7, 21, 2, 30, 0, 0));
    expect(result.toDateString()).toBe(new Date(2026, 7, 21).toDateString());
  });

  it("defaults to the current instant when called with no argument", () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 21, 0, 30, 0, 0));
    expect(effectiveToday().toDateString()).toBe(new Date(2026, 7, 20).toDateString());
  });
});

describe("easternTodayIso", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  // Can't prove this differs from device-local todayIso() from inside this suite -- TZ is pinned
  // to America/New_York for the whole run (see the file-level comment), so the two agree here by
  // construction. hallSpottedCounts.test.ts's mocked-divergence tests are what actually guard the
  // "uses the Eastern one, not the device-local one" call-site behavior; this suite only checks
  // easternTodayIso()'s own Intl.DateTimeFormat computation is correct at a real boundary instant.
  it("resolves the Eastern calendar day at an instant already rolled to the next UTC day (EDT, UTC-4)", () => {
    // 11:30 PM Eastern on Aug 20 == 3:30 AM UTC on Aug 21 (matches nowLocalIso's own EDT fixture above).
    jest.useFakeTimers().setSystemTime(new Date("2026-08-21T03:30:00.000Z"));

    expect(easternTodayIso()).toBe("2026-08-20");
    expect(easternTodayIso()).toBe(todayIso());
  });

  it("resolves the Eastern calendar day under EST (UTC-5), not just EDT", () => {
    // 11:30 PM Eastern on Jan 14 (EST) == 4:30 AM UTC on Jan 15.
    jest.useFakeTimers().setSystemTime(new Date("2026-01-15T04:30:00.000Z"));

    expect(easternTodayIso()).toBe("2026-01-14");
  });
});
