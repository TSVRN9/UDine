import type { LogEntry } from "@udine/shared";
import {
  buildFunStats,
  buildWeekChart,
  buildWeekStrip,
  computeDistinctDishCount,
  computeLoggingStreak,
  computeMostLoggedDish,
  computeTopMealShare,
  currentWeekDates,
  formatLogTime,
  lastSevenDates,
} from "./logsFormat";

const NUTRITION_FIXTURE = {
  servingSize: "1 serving",
  calories: 0,
  caloriesFromFat: 0,
  totalFatG: 0,
  satFatG: 0,
  transFatG: 0,
  cholesterolMg: 0,
  sodiumMg: 0,
  totalCarbG: 0,
  dietaryFiberG: 0,
  sugarsG: 0,
  proteinG: 0,
};

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: "1",
    loggedAt: "2026-08-19T12:00:00.000",
    source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 },
    servings: 1,
    nutrition: { ...NUTRITION_FIXTURE, calories: 100, proteinG: 10 },
    ...overrides,
  };
}

// --- formatLogTime: reintroduced from #118 (You pane no longer needs a per-entry time now that the
// log is meal-grouped, but the Logs screen's edit-state row shows one, e.g. "Hampshire · 8:40 AM ·
// 320 cal each"). --------------------------------------------------------------------------------

describe("formatLogTime", () => {
  it("formats a morning time with AM", () => {
    expect(formatLogTime("2026-08-19T08:40:00.000")).toBe("8:40 AM");
  });

  it("formats noon as 12:00 PM, not 0:00 PM", () => {
    expect(formatLogTime("2026-08-19T12:00:00.000")).toBe("12:00 PM");
  });

  it("formats midnight as 12:00 AM, not 0:00 AM", () => {
    expect(formatLogTime("2026-08-19T00:00:00.000")).toBe("12:00 AM");
  });

  it("reads the LOCAL hour, not the UTC hour, for a Z-suffixed timestamp (issue #111's trap)", () => {
    // 2026-08-19T14:00:00.000Z is 2:00 PM UTC == 10:00 AM Eastern (EDT, UTC-4 in August).
    expect(formatLogTime("2026-08-19T14:00:00.000Z")).toBe("10:00 AM");
  });
});

// --- lastSevenDates: the fixed 7-day window (today-6..today) shared by the week strip and the
// Last 7 Days chart, so both always agree on which calendar days they mean. -----------------------

describe("lastSevenDates", () => {
  it("returns 7 dates ending at (and including) today, oldest first", () => {
    expect(lastSevenDates("2026-08-20")).toEqual(["2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20"]);
  });

  it("crosses a month boundary correctly", () => {
    expect(lastSevenDates("2026-09-02")).toEqual(["2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"]);
  });
});

describe("currentWeekDates", () => {
  it("returns the Sun-Sat calendar week containing the given date, oldest (Sunday) first", () => {
    // 2026-08-20 is a Thursday.
    expect(currentWeekDates("2026-08-20")).toEqual(["2026-08-16", "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22"]);
  });

  it("is unchanged when given a Sunday (already the week start)", () => {
    expect(currentWeekDates("2026-08-16")[0]).toBe("2026-08-16");
  });

  it("crosses a month boundary correctly", () => {
    // 2026-08-31 is a Monday -- its week starts Sunday 08-30 and ends Saturday 09-05.
    expect(currentWeekDates("2026-08-31")).toEqual(["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
  });
});

// --- buildWeekStrip: chip data for the week-strip row -- selected day, gold dot on logged days,
// future days flagged so the UI can mute them. ------------------------------------------------

describe("buildWeekStrip", () => {
  it("marks hasLogs true only for days with at least one entry, by LOCAL day boundary", () => {
    // 11:30 PM local on the 18th is still the 18th locally -- a UTC-bucketing bug would push a
    // late-evening entry into the next day (issue #111's exact trap, re-tested here for day chips).
    const entries = [entry({ loggedAt: "2026-08-18T23:30:00.000" })];
    const chips = buildWeekStrip(entries, "2026-08-20", "2026-08-20");
    const chip18 = chips.find((c) => c.date === "2026-08-18")!;
    const chip19 = chips.find((c) => c.date === "2026-08-19")!;
    expect(chip18.hasLogs).toBe(true);
    expect(chip19.hasLogs).toBe(false);
  });

  it("flags exactly the selected date as isSelected", () => {
    const chips = buildWeekStrip([], "2026-08-19", "2026-08-20");
    expect(chips.find((c) => c.isSelected)?.date).toBe("2026-08-19");
  });

  it("labels each chip with its 3-letter uppercase weekday and day-of-month number", () => {
    const chips = buildWeekStrip([], "2026-08-20", "2026-08-20");
    const tue = chips.find((c) => c.date === "2026-08-18")!; // Tuesday
    expect(tue.dayLabel).toBe("TUE");
    expect(tue.dayNumber).toBe(18);
  });

  it("shows the calendar week (Sun-Sat) containing today, not a trailing 7-day window", () => {
    // 2026-08-20 is a Thursday -- its calendar week is Sun 08-16 .. Sat 08-22.
    const chips = buildWeekStrip([], "2026-08-20", "2026-08-20");
    expect(chips.map((c) => c.date)).toEqual(["2026-08-16", "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22"]);
  });

  it("flags the days after today (still within today's calendar week) as future", () => {
    // A trailing-7-days-ending-today window could never contain a future day, which would leave
    // the issue's future-day styling (muted 0.35 ink, 0.1-alpha border) permanently unreachable --
    // a calendar week does contain one whenever today isn't a Saturday.
    const chips = buildWeekStrip([], "2026-08-20", "2026-08-20");
    const future = chips.filter((c) => c.isFuture).map((c) => c.date);
    expect(future).toEqual(["2026-08-21", "2026-08-22"]);
    expect(chips.find((c) => c.date === "2026-08-20")?.isFuture).toBe(false); // today itself, not future
  });
});

// --- buildWeekChart: Last 7 Days bar data -- calories round-per-entry-then-sum (same convention as
// groupEntriesByMeal, #118), so a day's bar/total always agrees exactly with that day's own log
// screen total, not just approximately. ----------------------------------------------------------

describe("buildWeekChart", () => {
  it("sums each day's calories as round(calories * servings), matching groupEntriesByMeal's convention", () => {
    const entries = [
      entry({ id: "a", loggedAt: "2026-08-19T07:00:00.000", nutrition: { ...NUTRITION_FIXTURE, calories: 400 } }),
      entry({ id: "b", loggedAt: "2026-08-19T18:00:00.000", nutrition: { ...NUTRITION_FIXTURE, calories: 120 }, servings: 2 }),
    ];
    const chart = buildWeekChart(entries, "2026-08-20", "2026-08-20");
    const day19 = chart.days.find((d) => d.date === "2026-08-19")!;
    expect(day19.calories).toBe(640);
  });

  it("buckets a late-evening local entry into its own local day, not UTC's next day (#111)", () => {
    const entries = [entry({ loggedAt: "2026-08-18T23:30:00.000", nutrition: { ...NUTRITION_FIXTURE, calories: 500 } })];
    const chart = buildWeekChart(entries, "2026-08-20", "2026-08-20");
    expect(chart.days.find((d) => d.date === "2026-08-18")?.calories).toBe(500);
    expect(chart.days.find((d) => d.date === "2026-08-19")?.calories).toBe(0);
  });

  it("flags isToday and isSelected independently per day", () => {
    const chart = buildWeekChart([], "2026-08-20", "2026-08-18");
    expect(chart.days.find((d) => d.date === "2026-08-20")?.isToday).toBe(true);
    expect(chart.days.find((d) => d.date === "2026-08-18")?.isSelected).toBe(true);
    expect(chart.days.find((d) => d.date === "2026-08-18")?.isToday).toBe(false);
  });

  it("averages calories and protein over the full 7-day window, including no-log days", () => {
    // One day logs 1400 cal / 70g protein; the other 6 days log nothing. Averaging over the whole
    // window (not just logged days) means avgCalories = 1400/7 = 200, not 1400/1 = 1400.
    const entries = [entry({ loggedAt: "2026-08-20T12:00:00.000", nutrition: { ...NUTRITION_FIXTURE, calories: 1400, proteinG: 70 } })];
    const chart = buildWeekChart(entries, "2026-08-20", "2026-08-20");
    expect(chart.avgCalories).toBe(200);
    expect(chart.avgProteinG).toBe(10);
  });
});

// --- computeLoggingStreak: consecutive-day streak counted backward from today, with a same-day
// grace period (today not logged yet doesn't zero out an already-earned streak). Null, not 0, when
// there's no active streak -- the "skip insufficient data" gate. ----------------------------------

describe("computeLoggingStreak", () => {
  it("is null when there are no entries at all", () => {
    expect(computeLoggingStreak([], "2026-08-20")).toBeNull();
  });

  it("counts today plus consecutive prior days", () => {
    const entries = ["2026-08-20", "2026-08-19", "2026-08-18"].map((d, i) => entry({ id: String(i), loggedAt: `${d}T12:00:00.000` }));
    expect(computeLoggingStreak(entries, "2026-08-20")).toBe(3);
  });

  it("stops at the first gap", () => {
    const entries = ["2026-08-20", "2026-08-19", "2026-08-17"].map((d, i) => entry({ id: String(i), loggedAt: `${d}T12:00:00.000` }));
    expect(computeLoggingStreak(entries, "2026-08-20")).toBe(2);
  });

  it("keeps yesterday's streak alive even if today has no entry yet (same-day grace period)", () => {
    const entries = ["2026-08-19", "2026-08-18"].map((d, i) => entry({ id: String(i), loggedAt: `${d}T12:00:00.000` }));
    expect(computeLoggingStreak(entries, "2026-08-20")).toBe(2);
  });

  it("is null (not 0) when yesterday also has no entry -- the streak is broken, not zero-but-shown", () => {
    const entries = [entry({ loggedAt: "2026-08-10T12:00:00.000" })];
    expect(computeLoggingStreak(entries, "2026-08-20")).toBeNull();
  });
});

// --- computeMostLoggedDish: total servings logged per dish/product name, not entry count -- three
// 1-serving entries and one 3-serving entry both mean "eaten it 3 times". --------------------------

describe("computeMostLoggedDish", () => {
  it("is null when there are no entries", () => {
    expect(computeMostLoggedDish([])).toBeNull();
  });

  it("picks the dish with the highest total servings across entries", () => {
    const entries = [
      entry({ id: "1", source: { type: "umass-menu", dishName: "French Toast", hallTid: 3 }, servings: 2 }),
      entry({ id: "2", source: { type: "umass-menu", dishName: "French Toast", hallTid: 3 }, servings: 1 }),
      entry({ id: "3", source: { type: "umass-menu", dishName: "Tofu Stir Fry", hallTid: 1 }, servings: 2 }),
    ];
    expect(computeMostLoggedDish(entries)).toEqual({ name: "French Toast", count: 3 });
  });

  it("counts an off-menu product by its productName", () => {
    const entries = [entry({ source: { type: "off", barcode: "0123", productName: "Trail Mix" }, servings: 4 })];
    expect(computeMostLoggedDish(entries)).toEqual({ name: "Trail Mix", count: 4 });
  });
});

// --- computeDistinctDishCount: null (not 0) only when there are no entries -- the only way the
// count would legitimately be zero. ----------------------------------------------------------------

describe("computeDistinctDishCount", () => {
  it("is null when there are no entries", () => {
    expect(computeDistinctDishCount([])).toBeNull();
  });

  it("counts distinct dish names, not entries", () => {
    const entries = [
      entry({ id: "1", source: { type: "umass-menu", dishName: "French Toast", hallTid: 3 } }),
      entry({ id: "2", source: { type: "umass-menu", dishName: "French Toast", hallTid: 3 } }),
      entry({ id: "3", source: { type: "umass-menu", dishName: "Tofu Stir Fry", hallTid: 1 } }),
    ];
    expect(computeDistinctDishCount(entries)).toBe(2);
  });
});

// --- computeTopMealShare: which meal period carries the largest share of all-time logged calories.
// Null when total calories is 0 -- a share of a zero total isn't a meaningful percentage. -----------

describe("computeTopMealShare", () => {
  it("is null when total calories is 0 (no entries)", () => {
    expect(computeTopMealShare([])).toBeNull();
  });

  it("picks the meal period with the largest calorie share, rounded to a whole percent", () => {
    const entries = [
      entry({ id: "1", loggedAt: "2026-08-19T12:00:00.000", nutrition: { ...NUTRITION_FIXTURE, calories: 700 } }), // lunch
      entry({ id: "2", loggedAt: "2026-08-19T18:00:00.000", nutrition: { ...NUTRITION_FIXTURE, calories: 500 } }), // dinner
    ];
    const share = computeTopMealShare(entries);
    expect(share?.period).toBe("lunch");
    expect(share?.label).toBe("Lunch");
    expect(share?.pct).toBe(58); // 700/1200 = 58.33...%
  });
});

// --- buildFunStats: orchestrates the 4 above in canvas order, skipping any with insufficient data
// rather than rendering a zero (issue #119's explicit gate). ---------------------------------------

describe("buildFunStats", () => {
  it("returns no stats at all for a completely empty log", () => {
    expect(buildFunStats([], "2026-08-20")).toEqual([]);
  });

  it("returns all 4 stats, in canvas order, when there's enough data for each", () => {
    const entries = [
      entry({ id: "1", loggedAt: "2026-08-20T07:00:00.000", source: { type: "umass-menu", dishName: "French Toast", hallTid: 3 }, servings: 2, nutrition: { ...NUTRITION_FIXTURE, calories: 300 } }),
      entry({ id: "2", loggedAt: "2026-08-20T18:00:00.000", source: { type: "umass-menu", dishName: "Grilled Chicken", hallTid: 1 }, nutrition: { ...NUTRITION_FIXTURE, calories: 200 } }),
    ];
    const stats = buildFunStats(entries, "2026-08-20");
    expect(stats).toHaveLength(4);
    expect(stats[0].caption).toMatch(/streak/);
    expect(stats[1].figure).toBe("× 2");
    expect(stats[1].caption).toMatch(/French Toast/);
    expect(stats[2].caption).toMatch(/distinct dish/);
    expect(stats[3].gold).toBe(true);
  });

  it("skips a stat with insufficient data rather than rendering a zero -- here, no active streak", () => {
    const entries = [entry({ loggedAt: "2026-08-01T12:00:00.000" })]; // long past, streak broken
    const stats = buildFunStats(entries, "2026-08-20");
    expect(stats.some((s) => s.caption.match(/streak/))).toBe(false);
    // The other 3 stats still have data, so they still render.
    expect(stats.length).toBe(3);
  });
});
