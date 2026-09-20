import * as fs from "fs";
import * as path from "path";
import { DAILY_ALLOWANCE } from "./compare";
import { picksToday, recordDailyPick, remainingToday, type AllowanceStore } from "./compareAllowance";

jest.mock("./db", () => ({ getDb: jest.fn() }));

function stubStore(initial: string | null = null) {
  let raw = initial;
  const write = jest.fn(async (json: string) => {
    raw = json;
  });
  const store: AllowanceStore = { read: async () => raw, write };
  return { store, write, raw: () => raw };
}

// Local-time constructors, so the assertions mean "local" whatever TZ the runner has.
const at = (y: number, mo: number, d: number, h = 12, mi = 0, s = 0, ms = 0) => new Date(y, mo - 1, d, h, mi, s, ms);
const rec = (date: unknown, count: unknown) => JSON.stringify({ date, count });

describe("daily allowance", () => {
  it("is 5 and starts full", async () => {
    expect(DAILY_ALLOWANCE).toBe(5);
    const { store } = stubStore();
    expect(await picksToday(store, at(2026, 9, 20))).toBe(0);
    expect(await remainingToday(store, at(2026, 9, 20))).toBe(5);
  });

  it("counts recorded picks and persists one {date, count} record", async () => {
    const { store, raw } = stubStore();
    const now = at(2026, 9, 20);
    expect(await recordDailyPick(store, now)).toBe(1);
    expect(await recordDailyPick(store, now)).toBe(2);
    expect(JSON.parse(raw()!)).toEqual({ date: "2026-09-20", count: 2 });
    expect(await picksToday(store, now)).toBe(2);
    expect(await remainingToday(store, now)).toBe(3);
  });

  it("caps at DAILY_ALLOWANCE: the 6th record neither counts nor writes", async () => {
    const { store, write } = stubStore();
    const now = at(2026, 9, 20);
    for (let i = 0; i < DAILY_ALLOWANCE; i++) await recordDailyPick(store, now);
    expect(await remainingToday(store, now)).toBe(0);
    write.mockClear();
    expect(await recordDailyPick(store, now)).toBe(DAILY_ALLOWANCE);
    expect(write).not.toHaveBeenCalled();
    expect(await picksToday(store, now)).toBe(DAILY_ALLOWANCE);
    expect(await remainingToday(store, now)).toBe(0);
  });

  it("rolls over exactly at local midnight", async () => {
    const { store } = stubStore(rec("2026-09-20", 5));
    expect(await remainingToday(store, at(2026, 9, 20, 23, 59, 59, 999))).toBe(0);
    expect(await remainingToday(store, at(2026, 9, 21, 0, 0, 0, 0))).toBe(5);
    expect(await remainingToday(store, at(2026, 9, 21, 0, 0, 0, 1))).toBe(5);
  });

  it("a pick after midnight starts the new day at 1, not 6", async () => {
    const { store, raw } = stubStore(rec("2026-09-20", 5));
    expect(await recordDailyPick(store, at(2026, 9, 21, 0, 0, 0, 0))).toBe(1);
    expect(JSON.parse(raw()!)).toEqual({ date: "2026-09-21", count: 1 });
  });

  it("rolls over across a month and a year boundary", async () => {
    const eom = stubStore(rec("2026-01-31", 3));
    expect(await remainingToday(eom.store, at(2026, 1, 31, 23, 59, 59, 999))).toBe(2);
    expect(await remainingToday(eom.store, at(2026, 2, 1, 0, 0, 0, 0))).toBe(5);
    const eoy = stubStore(rec("2026-12-31", 4));
    expect(await remainingToday(eoy.store, at(2026, 12, 31, 23, 59, 59, 999))).toBe(1);
    expect(await remainingToday(eoy.store, at(2027, 1, 1, 0, 0, 0, 0))).toBe(5);
    expect(await recordDailyPick(eoy.store, at(2027, 1, 1, 0, 0, 0, 0))).toBe(1);
    expect(JSON.parse(eoy.raw()!).date).toBe("2027-01-01");
  });

  it("uses the LOCAL date, not the UTC one", async () => {
    // 21:30 local on the 20th is already the 21st in UTC for any zone behind UTC (CI: America/New_York), and
    // 00:30 local on the 21st is still the 20th in UTC for any zone ahead of it. Local must win either way.
    const late = at(2026, 9, 20, 21, 30);
    const early = at(2026, 9, 21, 0, 30);
    const a = stubStore();
    await recordDailyPick(a.store, late);
    expect(JSON.parse(a.raw()!).date).toBe("2026-09-20");
    const b = stubStore();
    await recordDailyPick(b.store, early);
    expect(JSON.parse(b.raw()!).date).toBe("2026-09-21");
  });

  it("zero-pads month and day", async () => {
    const { store, raw } = stubStore();
    await recordDailyPick(store, at(2026, 3, 5));
    expect(JSON.parse(raw()!).date).toBe("2026-03-05");
  });

  describe("missing, corrupt and legacy records count as zero", () => {
    const today = at(2026, 9, 20);
    const cases: [string, string | null][] = [
      ["missing", null],
      ["empty string", ""],
      ["garbage JSON", "{not json"],
      ["JSON null", "null"],
      ["a bare number", "3"],
      ["an array", "[1,2]"],
      ["no date", JSON.stringify({ count: 3 })],
      ["date is a number", rec(20260920, 3)],
      ["malformed date", rec("9/20/2026", 3)],
      ["count is a string", rec("2026-09-20", "3")],
      ["count is null", rec("2026-09-20", null)],
      ["count is fractional", rec("2026-09-20", 2.5)],
      ["negative count", rec("2026-09-20", -3)],
      ["a future date", rec("2026-09-21", 3)],
      ["a past date", rec("2026-09-19", 3)],
    ];
    it.each(cases)("%s", async (_name, raw) => {
      const { store } = stubStore(raw);
      expect(await picksToday(store, today)).toBe(0);
      expect(await remainingToday(store, today)).toBe(DAILY_ALLOWANCE);
      expect(await recordDailyPick(store, today)).toBe(1);
    });

    it("a count above the allowance is clamped, never allows more", async () => {
      const { store, write } = stubStore(rec("2026-09-20", 99));
      expect(await picksToday(store, today)).toBe(DAILY_ALLOWANCE);
      expect(await remainingToday(store, today)).toBe(0);
      expect(await recordDailyPick(store, today)).toBe(DAILY_ALLOWANCE);
      expect(write).not.toHaveBeenCalled();
    });

    it("a store that throws on read is treated as zero", async () => {
      const store: AllowanceStore = { read: async () => Promise.reject(new Error("db")), write: async () => {} };
      expect(await remainingToday(store, today)).toBe(DAILY_ALLOWANCE);
    });
  });
});

describe("residency", () => {
  it.each(["compareAllowance.ts", "compare.ts"])("%s imports nothing that syncs off-device", (file) => {
    const src = fs.readFileSync(path.join(__dirname, file), "utf8");
    expect(src).not.toMatch(/syncDiningHallRanks|supabase/i);
  });

  it("no export module references the allowance", () => {
    for (const file of fs.readdirSync(__dirname).filter((f) => /export/i.test(f) && !/\.test\./.test(f))) {
      expect(fs.readFileSync(path.join(__dirname, file), "utf8")).not.toMatch(/compareAllowance|compare_daily_allowance/);
    }
  });
});
