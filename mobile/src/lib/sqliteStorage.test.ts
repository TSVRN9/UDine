// Fake expo-sqlite backing a single `log_entries` row set -- same technique as
// customFoodsStorage.test.ts: exercises SqliteLogStorage's actual behavior without a real native
// SQLite binding (unavailable under jest). getAllAsync ignores its query/params and just returns
// every row -- getEntriesForDate no longer does its filtering in SQL (see sqliteStorage.ts's own
// comment on why), so the fake doesn't need to understand the query at all.
import type { LogEntry } from "@udine/shared";
import { SqliteLogStorage } from "./sqliteStorage";

const mockRows = new Map<string, { logged_at: string; source_json: string; servings: number; nutrition_json: string }>();

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => ({
    execAsync: async () => {},
    runAsync: async (sql: string, id: string, loggedAt?: string, sourceJson?: string, servings?: number, nutritionJson?: string) => {
      if (sql.startsWith("DELETE")) mockRows.delete(id);
      else mockRows.set(id, { logged_at: loggedAt!, source_json: sourceJson!, servings: servings!, nutrition_json: nutritionJson! });
    },
    getAllAsync: async () => [...mockRows.entries()].map(([id, row]) => ({ id, ...row })),
  }),
}));

beforeEach(() => mockRows.clear());

const NUTRITION = {
  servingSize: "1 serving",
  calories: 500,
  caloriesFromFat: 100,
  totalFatG: 11,
  satFatG: 3,
  transFatG: 0,
  cholesterolMg: 50,
  sodiumMg: 400,
  totalCarbG: 40,
  dietaryFiberG: 3,
  sugarsG: 5,
  proteinG: 30,
};

function entry(id: string, loggedAt: string): LogEntry {
  return { id, loggedAt, source: { type: "umass-menu", dishName: "Chicken Parm", hallTid: 1 }, servings: 1, nutrition: NUTRITION };
}

// #late-night-2am-day-rollover task 4: getEntriesForDate used to LIKE-match an entry's RAW
// calendar-day prefix against `isoDate`, which is normally an *effective* day. A snack logged at
// 12:30 AM is stamped with the new raw calendar day while its effective day is still the one
// that's ending, so it was invisible from that day's query until the clock crossed the rollover
// hour.
describe("SqliteLogStorage.getEntriesForDate", () => {
  it("includes an entry logged at 12:30 AM under the effective (closing) day, not its raw calendar-day prefix", async () => {
    const storage = new SqliteLogStorage();
    // Raw prefix is 2026-08-21 -- a plain LIKE '2026-08-21%' match would find this under the 21st.
    await storage.addEntry(entry("1", "2026-08-21T00:30:00.000"));

    expect(await storage.getEntriesForDate("2026-08-20")).toEqual([entry("1", "2026-08-21T00:30:00.000")]);
    expect(await storage.getEntriesForDate("2026-08-21")).toEqual([]);
  });

  it("includes an entry logged at 2:30 AM under its own raw calendar day -- already past the rollover hour", async () => {
    const storage = new SqliteLogStorage();
    await storage.addEntry(entry("1", "2026-08-21T02:30:00.000"));

    expect(await storage.getEntriesForDate("2026-08-21")).toEqual([entry("1", "2026-08-21T02:30:00.000")]);
    expect(await storage.getEntriesForDate("2026-08-20")).toEqual([]);
  });

  it("excludes an entry from a different day entirely", async () => {
    const storage = new SqliteLogStorage();
    await storage.addEntry(entry("1", "2026-08-15T12:00:00.000"));

    expect(await storage.getEntriesForDate("2026-08-20")).toEqual([]);
  });
});
