import { claimSighting, countsByHallToday } from "./sightingDedup";

// Same fake expo-sqlite technique as db.test.ts/menuHoursCache.test.ts -- mocked at the expo-sqlite
// boundary (not "./db") so getDb()'s own table-creation/singleton code stays in play. runAsync here
// simulates a real `INSERT OR IGNORE ... PRIMARY KEY` table: a key already in `mockRows` is a no-op
// (changes: 0), a new key is inserted (changes: 1) -- same shape SQLite itself reports. Named
// `mockRows` (not `rows`) because jest.mock() factories may only close over out-of-scope names that
// start with "mock" -- see jest's own "module factory is not allowed to reference out-of-scope
// variables" guard.
//
// getAllAsync (countsByHallToday) does the actual GROUP BY / WHERE sighted_date filtering here in
// JS instead of a real SQL engine -- this fake table has no query planner, so it mimics one just
// well enough to prove countsByHallToday's own grouping/filtering logic, not to double as a SQLite
// stand-in for every possible query.
type Row = { dish_name: string; hall_tid: number; sighted_date: string };
const mockRows = new Set<string>();
const mockRowsByKey = new Map<string, Row>();

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => ({
    execAsync: async () => {},
    runAsync: async (_sql: string, dishName: string, hallTid: number, sightedDate: string) => {
      const key = `${dishName}|${hallTid}|${sightedDate}`;
      if (mockRows.has(key)) return { changes: 0 };
      mockRows.add(key);
      mockRowsByKey.set(key, { dish_name: dishName, hall_tid: hallTid, sighted_date: sightedDate });
      return { changes: 1 };
    },
    getAllAsync: async (_sql: string, sightedDate: string) => {
      const counts = new Map<number, number>();
      for (const row of mockRowsByKey.values()) {
        if (row.sighted_date !== sightedDate) continue;
        counts.set(row.hall_tid, (counts.get(row.hall_tid) ?? 0) + 1);
      }
      return [...counts].map(([hall_tid, count]) => ({ hall_tid, count }));
    },
  }),
}));

beforeEach(() => {
  mockRows.clear();
  mockRowsByKey.clear();
});

it("claims a not-yet-seen (dish, hall, date) and reports it as new", async () => {
  await expect(claimSighting("Chicken Parm", 3, "2026-09-15")).resolves.toBe(true);
});

it("does not re-claim the same (dish, hall, date) a second time -- mirrors food_sightings' unique constraint", async () => {
  await claimSighting("Chicken Parm", 3, "2026-09-15");
  await expect(claimSighting("Chicken Parm", 3, "2026-09-15")).resolves.toBe(false);
});

it("treats a different hall, dish, or date as a distinct sighting", async () => {
  await claimSighting("Chicken Parm", 3, "2026-09-15");
  await expect(claimSighting("Chicken Parm", 4, "2026-09-15")).resolves.toBe(true); // different hall
  await expect(claimSighting("Pizza", 3, "2026-09-15")).resolves.toBe(true); // different dish
  await expect(claimSighting("Chicken Parm", 3, "2026-09-16")).resolves.toBe(true); // different date
});

describe("countsByHallToday", () => {
  it("groups claimed sightings by hall_tid for the given date", async () => {
    await claimSighting("Chicken Parm", 3, "2026-09-15");
    await claimSighting("Pizza", 3, "2026-09-15");
    await claimSighting("Tofu Stir Fry", 1, "2026-09-15");

    await expect(countsByHallToday("2026-09-15")).resolves.toEqual(
      new Map([
        [3, 2],
        [1, 1],
      ]),
    );
  });

  it("excludes sightings from other dates", async () => {
    await claimSighting("Chicken Parm", 3, "2026-09-14");
    await claimSighting("Pizza", 3, "2026-09-15");

    await expect(countsByHallToday("2026-09-15")).resolves.toEqual(new Map([[3, 1]]));
  });

  it("returns an empty map when nothing was claimed for that date", async () => {
    await expect(countsByHallToday("2026-09-15")).resolves.toEqual(new Map());
  });
});
