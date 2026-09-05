import type { DishCatalogEntry } from "@udine/shared";
import { getCachedDishCatalog, refreshDishCatalogIfStale, searchCachedDishes, type CachedDishCatalog } from "./dishCatalog";

// Same fake expo-sqlite technique as menuHoursCache.test.ts -- a single preferences_kv row set
// keyed by SQL text's positional `?` params, mocked at the expo-sqlite boundary (not "./db") so
// getDb()'s own table-creation/singleton code stays in play.
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

const mockFetchDishCatalog = jest.fn<Promise<DishCatalogEntry[]>, [unknown, string | undefined]>();
jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  fetchDishCatalog: (supabase: unknown, updatedSince?: string) => mockFetchDishCatalog(supabase, updatedSince),
}));

beforeEach(() => {
  mockRows.clear();
  mockFetchDishCatalog.mockReset();
});

function entry(dishName: string, calories = 100): DishCatalogEntry {
  return {
    dishName,
    nutrition: {
      servingSize: "1 serving",
      calories,
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
    updatedAt: "2026-08-19T00:00:00.000Z",
  };
}

const fakeSupabase = {} as never;

describe("getCachedDishCatalog", () => {
  it("returns null when nothing has been cached yet", async () => {
    expect(await getCachedDishCatalog()).toBeNull();
  });
});

describe("refreshDishCatalogIfStale", () => {
  it("does a full fetch (no updatedSince) and writes the cache when nothing is cached yet", async () => {
    mockFetchDishCatalog.mockResolvedValue([entry("Pizza")]);
    await refreshDishCatalogIfStale(fakeSupabase);
    expect(mockFetchDishCatalog).toHaveBeenCalledWith(fakeSupabase, undefined);
    const cached = await getCachedDishCatalog();
    expect(cached?.entries).toEqual([entry("Pizza")]);
    expect(typeof cached?.lastSyncedAt).toBe("string");
  });

  it("skips the fetch entirely when the cache is fresher than maxAgeMs", async () => {
    mockFetchDishCatalog.mockResolvedValue([entry("Pizza")]);
    await refreshDishCatalogIfStale(fakeSupabase, 24 * 60 * 60 * 1000);
    mockFetchDishCatalog.mockClear();

    await refreshDishCatalogIfStale(fakeSupabase, 24 * 60 * 60 * 1000);
    expect(mockFetchDishCatalog).not.toHaveBeenCalled();
  });

  it("does a delta fetch with the prior lastSyncedAt once the cache is stale, and merges by dishName", async () => {
    mockFetchDishCatalog.mockResolvedValue([entry("Pizza", 100)]);
    await refreshDishCatalogIfStale(fakeSupabase, 0); // immediately stale
    const firstSync = (await getCachedDishCatalog())!.lastSyncedAt;

    mockFetchDishCatalog.mockResolvedValue([entry("Pizza", 250), entry("Falafel")]);
    await refreshDishCatalogIfStale(fakeSupabase, 0);

    expect(mockFetchDishCatalog).toHaveBeenLastCalledWith(fakeSupabase, firstSync);
    const cached = await getCachedDishCatalog();
    expect(cached?.entries).toHaveLength(2);
    expect(cached?.entries.find((e) => e.dishName === "Pizza")?.nutrition.calories).toBe(250); // overwritten
    expect(cached?.entries.find((e) => e.dishName === "Falafel")).toBeTruthy();
  });

  it("swallows a fetch error, logging rather than throwing, and leaves the existing cache in place", async () => {
    mockFetchDishCatalog.mockResolvedValue([entry("Pizza")]);
    await refreshDishCatalogIfStale(fakeSupabase, 0);

    mockFetchDishCatalog.mockRejectedValue(new Error("network down"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    await expect(refreshDishCatalogIfStale(fakeSupabase, 0)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();

    const cached = await getCachedDishCatalog();
    expect(cached?.entries).toEqual([entry("Pizza")]); // untouched
  });
});

describe("searchCachedDishes", () => {
  const catalog: CachedDishCatalog = { entries: [entry("Falafel Wrap"), entry("Pizza")], lastSyncedAt: "x" };

  it("matches case-insensitively on a substring of dishName", () => {
    expect(searchCachedDishes(catalog, "falafel").map((e) => e.dishName)).toEqual(["Falafel Wrap"]);
    expect(searchCachedDishes(catalog, "PIZZA").map((e) => e.dishName)).toEqual(["Pizza"]);
  });

  it("returns an empty array for an empty query", () => {
    expect(searchCachedDishes(catalog, "")).toEqual([]);
    expect(searchCachedDishes(catalog, "   ")).toEqual([]);
  });

  it("returns an empty array when the catalog is null", () => {
    expect(searchCachedDishes(null, "pizza")).toEqual([]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(searchCachedDishes(catalog, "sushi")).toEqual([]);
  });
});
