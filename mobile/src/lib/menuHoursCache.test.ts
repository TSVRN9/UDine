import type { DiningHoursFeed, MenuItem } from "@udine/shared";

import { fetchHoursAndCache, getCachedHours, getCachedMenu, isMenuCacheFinal, saveCachedHours, saveCachedMenu } from "./menuHoursCache";
import { __resetRetailNamesForTest, hallOrRetailName } from "./retailHallNames";

// Same fake expo-sqlite technique as seenDishesStorage.test.ts -- a single preferences_kv row set
// keyed by SQL text's positional `?` params, mocked at the expo-sqlite boundary (not "./db") so
// getDb()'s own table-creation/singleton code stays in play. The real native module can't run
// under jest (see that file's comment for the exact confirmed error).
const mockRows = new Map<string, string>();

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => ({
    execAsync: async () => {},
    runAsync: async (_sql: string, key: string, value: string) => {
      mockRows.set(key, value);
    },
    getFirstAsync: async (_sql: string, key: string) => (mockRows.has(key) ? { value_json: mockRows.get(key) } : null),
  }),
}));

const mockFetchDiningHours = jest.fn<Promise<DiningHoursFeed>, []>();
jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  fetchDiningHours: () => mockFetchDiningHours(),
}));

beforeEach(() => {
  mockRows.clear();
  mockFetchDiningHours.mockReset();
  __resetRetailNamesForTest();
});

function item(dishName: string): MenuItem {
  return {
    dishName,
    category: "Entrees",
    mealPeriod: "lunch",
    hallTid: 3,
    date: "2026-08-19",
    nutrition: {
      servingSize: "1 serving",
      calories: 100,
      caloriesFromFat: 10,
      totalFatG: 5,
      satFatG: 1,
      transFatG: 0,
      cholesterolMg: 0,
      sodiumMg: 0,
      totalCarbG: 10,
      dietaryFiberG: 1,
      sugarsG: 1,
      proteinG: 20,
    },
    allergens: [],
    dietTags: [],
  };
}

function feed(): DiningHoursFeed {
  return { halls: [{ hallTid: 3, breakfast: null, lunch: { openTime: "11:00 AM", closeTime: "2:00 PM" }, dinner: null, latenight: null, general: null }], retail: [] };
}

function feedWithRetail(): DiningHoursFeed {
  return {
    halls: feed().halls,
    retail: [{ name: "People's Organic Coffee", hours: null, locationId: 32 }],
  };
}

describe("menu cache", () => {
  it("round-trips a saved menu for the exact (hallTid, date) key", async () => {
    const items = [item("Chicken")];
    await saveCachedMenu(3, new Date(2026, 7, 19), items);
    const cached = await getCachedMenu(3, new Date(2026, 7, 19));
    expect(cached?.items).toEqual(items);
    expect(typeof cached?.fetchedAt).toBe("string");
  });

  it("keys on local calendar day, not the Date's time-of-day", async () => {
    await saveCachedMenu(3, new Date(2026, 7, 19, 23, 59), [item("Late Snack")]);
    const cached = await getCachedMenu(3, new Date(2026, 7, 19, 0, 1));
    expect(cached?.items[0].dishName).toBe("Late Snack");
  });

  it("returns null for a (hallTid, date) never cached", async () => {
    expect(await getCachedMenu(1, new Date(2026, 7, 19))).toBeNull();
  });

  it("keeps different halls and different dates as distinct entries", async () => {
    await saveCachedMenu(1, new Date(2026, 7, 19), [item("Worcester Dish")]);
    await saveCachedMenu(3, new Date(2026, 7, 19), [item("Hampshire Dish")]);
    await saveCachedMenu(3, new Date(2026, 7, 20), [item("Hampshire Tomorrow")]);
    expect((await getCachedMenu(1, new Date(2026, 7, 19)))?.items[0].dishName).toBe("Worcester Dish");
    expect((await getCachedMenu(3, new Date(2026, 7, 19)))?.items[0].dishName).toBe("Hampshire Dish");
    expect((await getCachedMenu(3, new Date(2026, 7, 20)))?.items[0].dishName).toBe("Hampshire Tomorrow");
  });

  // Owner's model (brief's Rationale): a day's menu doesn't change once that day has started, so a
  // copy fetched on/after that day's local start is final and never re-fetched. saveCachedMenu must
  // never clobber it with a later empty result (a transient scrape glitch, not a real "no items"
  // answer) -- the acceptance line right below covers that half; this is the read-side guard.
  it("never overwrites a non-empty cached row with an empty save", async () => {
    await saveCachedMenu(1, new Date(2026, 7, 19), [item("Chicken")]);
    await saveCachedMenu(1, new Date(2026, 7, 19), []);
    expect((await getCachedMenu(1, new Date(2026, 7, 19)))?.items).toEqual([item("Chicken")]);
  });

  it("still writes an empty save when no non-empty row exists yet", async () => {
    await saveCachedMenu(1, new Date(2026, 7, 19), []);
    expect((await getCachedMenu(1, new Date(2026, 7, 19)))?.items).toEqual([]);
  });

  it("an empty save after an empty save still writes (both empty, nothing to protect)", async () => {
    await saveCachedMenu(1, new Date(2026, 7, 19), []);
    await saveCachedMenu(1, new Date(2026, 7, 19), []);
    expect(await getCachedMenu(1, new Date(2026, 7, 19))).not.toBeNull();
  });
});

describe("isMenuCacheFinal", () => {
  const date = new Date(2026, 7, 19); // local Aug 19

  it("is final when fetchedAt is exactly the local start of the date and items exist", () => {
    expect(isMenuCacheFinal({ items: [item("Chicken")], fetchedAt: new Date(2026, 7, 19, 0, 0, 0).toISOString() }, date)).toBe(true);
  });

  it("is final when fetchedAt is later the same day and items exist", () => {
    expect(isMenuCacheFinal({ items: [item("Chicken")], fetchedAt: new Date(2026, 7, 19, 23, 59).toISOString() }, date)).toBe(true);
  });

  it("is not final when fetchedAt is before the local start of the date, even with items", () => {
    expect(isMenuCacheFinal({ items: [item("Chicken")], fetchedAt: new Date(2026, 7, 18, 23, 59).toISOString() }, date)).toBe(false);
  });

  it("is never final with an empty items array, no matter when it was fetched", () => {
    expect(isMenuCacheFinal({ items: [], fetchedAt: new Date(2026, 7, 19, 12, 0).toISOString() }, date)).toBe(false);
  });
});

// #181 review finding 6: a persisted blob from a schema this file no longer understands (an app
// upgrade changed MenuItem's or DiningHoursFeed's shape) must degrade to a clean cache miss, not
// get parsed as if it were the current shape. Writes the raw row directly (bypassing
// saveCachedMenu/saveCachedHours, which always stamp the CURRENT version) to simulate exactly that.
describe("schema versioning", () => {
  it("treats a menu cache row with no version tag (pre-#181-review-fix shape) as absent, not a crash", async () => {
    mockRows.set("menu_cache:3|2026-08-19", JSON.stringify({ items: [item("Old Shape")], fetchedAt: "2026-08-19T12:00:00.000Z" }));
    expect(await getCachedMenu(3, new Date(2026, 7, 19))).toBeNull();
  });

  it("treats a menu cache row with a mismatched version number as absent", async () => {
    mockRows.set("menu_cache:3|2026-08-19", JSON.stringify({ v: 999, data: { items: [item("Future Shape")], fetchedAt: "x" } }));
    expect(await getCachedMenu(3, new Date(2026, 7, 19))).toBeNull();
  });

  it("treats an hours cache row with a mismatched version as absent", async () => {
    mockRows.set("hours_cache:v1", JSON.stringify({ v: 0, data: { feed: feed(), fetchedAt: "x" } }));
    expect(await getCachedHours()).toBeNull();
  });

  it("a freshly-saved entry round-trips (sanity check that the CURRENT version is accepted)", async () => {
    await saveCachedMenu(3, new Date(2026, 7, 19), [item("Current Shape")]);
    expect((await getCachedMenu(3, new Date(2026, 7, 19)))?.items[0].dishName).toBe("Current Shape");
  });
});

describe("hours cache", () => {
  it("round-trips a saved hours feed", async () => {
    await saveCachedHours(feed());
    const cached = await getCachedHours();
    expect(cached?.feed).toEqual(feed());
    expect(typeof cached?.fetchedAt).toBe("string");
  });

  it("returns null when nothing has been cached yet", async () => {
    expect(await getCachedHours()).toBeNull();
  });

  // #243 bug A wiring, offline half: fetchHoursAndCache never runs to completion when the live
  // fetch rejects (advisor review finding) -- so a device that's offline right now, but has a
  // warm cache from an earlier successful fetch, must also learn café names from a cache HIT, not
  // only from a live fetch.
  it("also teaches retailHallNames the retail feed's tid->name pairs on a cache hit", async () => {
    await saveCachedHours(feedWithRetail());
    await getCachedHours();
    expect(hallOrRetailName(32)).toBe("People's Organic Coffee");
  });
});

describe("fetchHoursAndCache", () => {
  it("returns the live feed and writes it to the cache on success", async () => {
    mockFetchDiningHours.mockResolvedValue(feed());
    const result = await fetchHoursAndCache();
    expect(result).toEqual(feed());
    // Cache write is fire-and-forget -- flush microtasks before reading it back.
    await Promise.resolve();
    await Promise.resolve();
    expect((await getCachedHours())?.feed).toEqual(feed());
  });

  it("propagates the rejection and leaves any existing cache untouched on failure", async () => {
    await saveCachedHours(feed()); // a prior good cache exists
    mockFetchDiningHours.mockRejectedValue(new Error("network down"));
    await expect(fetchHoursAndCache()).rejects.toThrow("network down");
    expect((await getCachedHours())?.feed).toEqual(feed()); // untouched, not cleared
  });

  // #243 bug A wiring: a live hours fetch must teach retailHallNames.ts's device-side tid->name
  // map, not just cache the feed -- otherwise Today's Log/rank still fall back to "Hall 32" for a
  // café dish even though this exact fetch carried the café's real name. Asserted through the
  // real hallOrRetailName import (not a mock) so a dropped wiring line actually goes red here.
  it("teaches retailHallNames the retail feed's tid->name pairs on a live fetch", async () => {
    mockFetchDiningHours.mockResolvedValue(feedWithRetail());
    await fetchHoursAndCache();
    expect(hallOrRetailName(32)).toBe("People's Organic Coffee");
  });
});
