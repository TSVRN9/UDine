// Migrated from panes/YouPane.test.tsx's "YouPane export" describe block (#182 -- the inline
// Export Your Data buttons moved out of YouPane into this module + the /export screen, #183).
// Same native-bindings rationale as YouPane.test.tsx's own storage mocks: SqliteLogStorage/
// SqliteRankingStorage/SqliteFavoritesStorage all drag in expo-sqlite outside jest-expo's native
// harness, so each is mocked at module scope with jest.fn()s captured inside the factory.

// jest.fn()s are created *inside* each factory, not referenced from an outer `const ... = jest.fn()`
// -- exportShare.ts instantiates each storage eagerly at module scope, and a factory that instead
// closed over an outer-scope mock var would capture it before it's initialized (see
// YouPane.test.tsx's own comment on this exact hazard). A second `new SqliteLogStorage()` etc.
// below grabs the same jest.fn() references the factory closed over.
import type { LogEntry, RankedDish } from "@udine/shared";
import * as FileSystem from "expo-file-system/legacy";
import { SqliteFavoritesStorage } from "./favoritesStorage";
import { SqliteLogStorage } from "./sqliteStorage";
import { SqliteRankingStorage } from "./rankingStorage";
import { exportFavorites, exportLog, exportRankedDishes, exportRankedFoods } from "./exportShare";

jest.mock("./sqliteStorage", () => {
  const getAllEntries = jest.fn();
  return { SqliteLogStorage: jest.fn().mockImplementation(() => ({ getAllEntries })) };
});
jest.mock("./rankingStorage", () => {
  const getRankedDishes = jest.fn();
  const getRankedFoods = jest.fn();
  return { SqliteRankingStorage: jest.fn().mockImplementation(() => ({ getRankedDishes, getRankedFoods })) };
});
jest.mock("./favoritesStorage", () => {
  const getFavorites = jest.fn();
  return { SqliteFavoritesStorage: jest.fn().mockImplementation(() => ({ getFavorites })) };
});

jest.mock("expo-file-system/legacy", () => ({ cacheDirectory: "file:///cache/", writeAsStringAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn().mockResolvedValue(false), shareAsync: jest.fn() }));

const mockWriteAsStringAsync = FileSystem.writeAsStringAsync as jest.Mock;
const logMock = new SqliteLogStorage() as unknown as { getAllEntries: jest.Mock };
const rankingMock = new SqliteRankingStorage() as unknown as { getRankedDishes: jest.Mock; getRankedFoods: jest.Mock };
const favoritesMock = new SqliteFavoritesStorage() as unknown as { getFavorites: jest.Mock };

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

function logEntry(id: string, dishName: string, hallTid: number, loggedAt: string): LogEntry {
  return { id, loggedAt, source: { type: "umass-menu", dishName, hallTid }, servings: 1, nutrition: NUTRITION };
}

const rankedDishesForOneRankedHall: RankedDish[] = [
  { dishName: "A", hallTid: 1, rating: 1500, comparisonCount: 3 },
  { dishName: "B", hallTid: 1, rating: 1600, comparisonCount: 3 },
];

beforeEach(() => {
  jest.clearAllMocks();
  logMock.getAllEntries.mockResolvedValue([]);
  rankingMock.getRankedDishes.mockResolvedValue([]);
  rankingMock.getRankedFoods.mockResolvedValue([]);
  favoritesMock.getFavorites.mockResolvedValue([]);
});

describe("exportLog", () => {
  it("exports a freshly-read entry list, not a stale caller's copy", async () => {
    const stays = logEntry("stays", "Tofu Stir Fry", 1, "2026-08-01T12:00:00.000Z");
    logMock.getAllEntries.mockResolvedValue([stays]);

    await exportLog("json");

    expect(mockWriteAsStringAsync).toHaveBeenCalledTimes(1);
    const [, content] = mockWriteAsStringAsync.mock.calls[0];
    expect(content).toMatch(/Tofu Stir Fry/);
  });
});

describe("exportRankedDishes", () => {
  it("exports the ranked-dish data as JSON", async () => {
    rankingMock.getRankedDishes.mockResolvedValue(rankedDishesForOneRankedHall);
    await exportRankedDishes("json");
    const [path, content] = mockWriteAsStringAsync.mock.calls[0];
    expect(path).toMatch(/udine-ranked-dishes\.json$/);
    expect(content).toMatch(/"dishName": "A"/);
    expect(content).toMatch(/"hallTid": 1/);
  });

  it("exports the ranked-dish data as CSV, not JSON", async () => {
    rankingMock.getRankedDishes.mockResolvedValue(rankedDishesForOneRankedHall);
    await exportRankedDishes("csv");
    const [path, content] = mockWriteAsStringAsync.mock.calls[0];
    expect(path).toMatch(/udine-ranked-dishes\.csv$/);
    expect(content).toBe('dishName,hallTid,rating,comparisonCount\n"A","1","1500","3"\n"B","1","1600","3"');
  });
});

describe("exportRankedFoods", () => {
  it("exports the ranked-food data as JSON, not rankedDishes or the log", async () => {
    rankingMock.getRankedFoods.mockResolvedValue([{ dishName: "Chicken Parm", rating: 1650, comparisonCount: 5 }]);
    await exportRankedFoods("json");
    const [path, content] = mockWriteAsStringAsync.mock.calls[0];
    expect(path).toMatch(/udine-ranked-foods\.json$/);
    expect(content).toMatch(/"dishName": "Chicken Parm"/);
    expect(content).toMatch(/"rating": 1650/);
  });

  it("exports the ranked-food data as CSV, not JSON", async () => {
    rankingMock.getRankedFoods.mockResolvedValue([{ dishName: "Chicken Parm", rating: 1650, comparisonCount: 5 }]);
    await exportRankedFoods("csv");
    const [path, content] = mockWriteAsStringAsync.mock.calls[0];
    expect(path).toMatch(/udine-ranked-foods\.csv$/);
    expect(content).toBe('dishName,rating,comparisonCount\n"Chicken Parm","1650","5"');
  });
});

describe("exportFavorites", () => {
  it("exports the favorites store's data as JSON", async () => {
    favoritesMock.getFavorites.mockResolvedValue([{ type: "dish", dishName: "Chicken Parm" }]);
    await exportFavorites("json");
    const [path, content] = mockWriteAsStringAsync.mock.calls[0];
    expect(path).toMatch(/udine-favorites\.json$/);
    expect(content).toMatch(/"dishName": "Chicken Parm"/);
  });

  it("exports the favorites store's data as CSV, not JSON", async () => {
    favoritesMock.getFavorites.mockResolvedValue([{ type: "location", hallTid: 3 }]);
    await exportFavorites("csv");
    const [path, content] = mockWriteAsStringAsync.mock.calls[0];
    expect(path).toMatch(/udine-favorites\.csv$/);
    expect(content).toBe('type,dishName,hallTid\n"location","","3"');
  });
});
