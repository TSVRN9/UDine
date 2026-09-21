import * as fs from "fs";
import * as path from "path";
import { DAILY_ALLOWANCE } from "./compare";
import { getDb } from "./db";
import { memoryAllowanceStore, picksToday, recordDailyPick, remainingToday, withDailyPick, type AllowanceStore } from "./compareAllowance";

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

  it("overlapping picks are serialized: none is lost", async () => {
    let raw: string | null = null;
    const tick = () => new Promise<void>((r) => setTimeout(r, 0));
    const store: AllowanceStore = {
      read: async () => (await tick(), raw),
      write: async (json) => {
        await tick();
        raw = json;
      },
    };
    const now = at(2026, 9, 20);
    const [a, b] = await Promise.all([recordDailyPick(store, now), recordDailyPick(store, now)]);
    expect([a, b]).toEqual([1, 2]);
    expect(JSON.parse(raw!)).toEqual({ date: "2026-09-20", count: 2 });
  });

  it("a failed write rejects to the caller, does not wedge the queue, and leaves the count uncorrupted", async () => {
    let raw: string | null = null;
    let fail = true;
    const store: AllowanceStore = {
      read: async () => raw,
      write: async (json) => {
        if (fail) throw new Error("disk full");
        raw = json;
      },
    };
    const now = at(2026, 9, 20);
    const bad = recordDailyPick(store, now);
    const next = recordDailyPick(store, now); // queued behind the failing call
    await expect(bad).rejects.toThrow("disk full");
    fail = false;
    expect(await next).toBe(1);
    expect(await recordDailyPick(store, now)).toBe(2);
    expect(JSON.parse(raw!)).toEqual({ date: "2026-09-20", count: 2 });
  });

  describe("withDailyPick: check + save + count as one serialized step", () => {
    const now = at(2026, 9, 20);
    const ticks = async (n: number) => {
      for (let i = 0; i < n; i++) await Promise.resolve();
    };
    // Every store call and every save takes a few microtask ticks, so the offsets below land flow 2 in every gap of flow 1.
    function slowStore(initial: string | null) {
      let raw = initial;
      const store: AllowanceStore = {
        read: async () => (await ticks(2), raw),
        write: async (json) => {
          await ticks(2);
          raw = json;
        },
      };
      return { store, raw: () => (raw ? JSON.parse(raw).count : 0) };
    }
    const offsets = Array.from({ length: 21 }, (_, i) => i);

    it.each(offsets)("two flows started %i ticks apart at 4 of 5: exactly one save, count ends at 5", async (offset) => {
      const { store, raw } = slowStore(rec("2026-09-20", 4));
      const save = jest.fn(async () => (await ticks(3), "saved"));
      const first = withDailyPick(store, now, save);
      await ticks(offset);
      const second = withDailyPick(store, now, save);
      const [a, b] = await Promise.all([first, second]);
      expect(save).toHaveBeenCalledTimes(1);
      expect(a).toEqual({ capped: false, result: "saved", used: 5 });
      expect(b).toEqual({ capped: true });
      expect(raw()).toBe(5);
    });

    it.each(offsets)("two flows started %i ticks apart at 5 of 5: neither saves", async (offset) => {
      const { store, raw } = slowStore(rec("2026-09-20", 5));
      const save = jest.fn(async () => "saved");
      const first = withDailyPick(store, now, save);
      await ticks(offset);
      expect(await Promise.all([first, withDailyPick(store, now, save)])).toEqual([{ capped: true }, { capped: true }]);
      expect(save).not.toHaveBeenCalled();
      expect(raw()).toBe(5);
    });

    it("counts one per saved pick from empty, and the cap check comes before save", async () => {
      const { store, raw } = stubStore();
      const order: string[] = [];
      const save = jest.fn(async () => (order.push("save"), "r"));
      for (let i = 1; i <= DAILY_ALLOWANCE; i++) expect(await withDailyPick(store, now, save)).toEqual({ capped: false, result: "r", used: i });
      expect(JSON.parse(raw()!)).toEqual({ date: "2026-09-20", count: 5 });
      expect(await withDailyPick(store, now, save)).toEqual({ capped: true });
      expect(save).toHaveBeenCalledTimes(5);
    });

    it("the count is written only after save succeeds", async () => {
      const { store, write } = stubStore();
      let writesDuringSave = -1;
      await withDailyPick(store, now, async () => {
        writesDuringSave = write.mock.calls.length;
        return "r";
      });
      expect(writesDuringSave).toBe(0);
      expect(write).toHaveBeenCalledTimes(1);
    });

    it("a null save counts nothing and the next flow still runs", async () => {
      const { store, write, raw } = stubStore(rec("2026-09-20", 2));
      expect(await withDailyPick(store, now, async () => null)).toEqual({ capped: false, result: null, used: 2 });
      expect(write).not.toHaveBeenCalled();
      expect(await withDailyPick(store, now, async () => "r")).toEqual({ capped: false, result: "r", used: 3 });
      expect(JSON.parse(raw()!).count).toBe(3);
    });

    it("a throwing save rejects to its caller, counts nothing, and does not wedge a flow queued behind it", async () => {
      const { store, raw } = stubStore(rec("2026-09-20", 2));
      const bad = withDailyPick(store, now, async () => {
        throw new Error("disk full");
      });
      const next = withDailyPick(store, now, async () => "r");
      await expect(bad).rejects.toThrow("disk full");
      expect(await next).toEqual({ capped: false, result: "r", used: 3 });
      expect(JSON.parse(raw()!).count).toBe(3);
    });

    it("a rejecting count write leaves the pick saved and uncounted (fail-open)", async () => {
      const raw = rec("2026-09-20", 3);
      const store: AllowanceStore = { read: async () => raw, write: async () => Promise.reject(new Error("disk full")) };
      const save = jest.fn(async () => "r");
      expect(await withDailyPick(store, now, save)).toEqual({ capped: false, result: "r", used: 3 });
      expect(save).toHaveBeenCalledTimes(1);
      expect(await withDailyPick(store, now, save)).toEqual({ capped: false, result: "r", used: 3 }); // and does not wedge
    });

    it("a rejecting read is zero, as picksToday treats it: the pick saves and counts 1", async () => {
      let raw: string | null = null;
      const store: AllowanceStore = { read: async () => Promise.reject(new Error("db")), write: async (json) => void (raw = json) };
      expect(await withDailyPick(store, now, async () => "r")).toEqual({ capped: false, result: "r", used: 1 });
      expect(JSON.parse(raw!)).toEqual({ date: "2026-09-20", count: 1 });
    });

    it("shares the queue with recordDailyPick without deadlocking, in start order", async () => {
      const { store, raw } = slowStore(null);
      const [a, b, c] = await Promise.all([withDailyPick(store, now, async () => "r"), recordDailyPick(store, now), withDailyPick(store, now, async () => "r")]);
      expect([a, b, c]).toEqual([{ capped: false, result: "r", used: 1 }, 2, { capped: false, result: "r", used: 3 }]);
      expect(raw()).toBe(3);
    });

    it("a save that never settles blocks every later flow (the queue's documented ceiling)", async () => {
      // Released at the end so the module-level queue is free for the rest of the file.
      const { store } = stubStore();
      let release!: (v: string) => void;
      const stuck = withDailyPick(store, now, () => new Promise<string>((r) => (release = r)));
      const behind = jest.fn(async () => "r");
      const later = withDailyPick(store, now, behind);
      await ticks(50);
      expect(behind).not.toHaveBeenCalled();
      release("r");
      await Promise.all([stuck, later]);
      expect(behind).toHaveBeenCalledTimes(1);
    });
  });

  it("local days follow the calendar across DST changes", async () => {
    // Built from local-time constructors, so it holds in any TZ; under America/New_York it is the real DST case.
    const spring = stubStore(rec("2026-03-08", 5));
    expect(await remainingToday(spring.store, at(2026, 3, 8, 1, 59))).toBe(0);
    expect(await remainingToday(spring.store, at(2026, 3, 8, 3, 0))).toBe(0);
    expect(await remainingToday(spring.store, at(2026, 3, 8, 23, 59, 59, 999))).toBe(0);
    expect(await remainingToday(spring.store, at(2026, 3, 9, 0, 0))).toBe(5);

    // 2026-11-01 has a repeated 01:30 (and 25 hours): both instants are one local date, and midnight is not +24h.
    const first = at(2026, 11, 1, 1, 30);
    const second = new Date(first.getTime() + 3600_000);
    const fall = stubStore();
    await recordDailyPick(fall.store, first);
    expect(await recordDailyPick(fall.store, second)).toBe(2);
    expect(JSON.parse(fall.raw()!).date).toBe("2026-11-01");
    const full = stubStore(rec("2026-11-01", 5));
    expect(await remainingToday(full.store, at(2026, 11, 1, 23, 59, 59, 999))).toBe(0);
    expect(await remainingToday(full.store, at(2026, 11, 2, 0, 0))).toBe(5);
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

describe("memoryAllowanceStore (dev fixtures)", () => {
  const now = at(2026, 9, 20);
  it("starts empty, or already holding `count` picks for that local date", async () => {
    expect(await picksToday(memoryAllowanceStore(0, now), now)).toBe(0);
    expect(await picksToday(memoryAllowanceStore(DAILY_ALLOWANCE, now), now)).toBe(DAILY_ALLOWANCE);
    expect(await remainingToday(memoryAllowanceStore(DAILY_ALLOWANCE, now), now)).toBe(0);
    expect(await picksToday(memoryAllowanceStore(DAILY_ALLOWANCE, now), at(2026, 9, 21))).toBe(0); // next day
  });

  it("is a real read/write store: recordDailyPick counts on it, and it never touches the sqlite store", async () => {
    const store = memoryAllowanceStore(0, now);
    expect(await recordDailyPick(store, now)).toBe(1);
    expect(await picksToday(store, now)).toBe(1);
    expect(getDb).not.toHaveBeenCalled();
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
