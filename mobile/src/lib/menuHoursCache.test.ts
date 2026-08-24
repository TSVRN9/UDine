import type { DiningHoursFeed, MenuItem } from "@udine/shared";

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

import { fetchHoursAndCache, getCachedHours, getCachedMenu, saveCachedHours, saveCachedMenu } from "./menuHoursCache";

beforeEach(() => {
  mockRows.clear();
  mockFetchDiningHours.mockReset();
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
});
