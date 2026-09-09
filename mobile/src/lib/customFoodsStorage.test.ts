// Fake expo-sqlite backing a single `custom_foods` row set -- same technique as
// seenDishesStorage.test.ts: exercises SqliteCustomFoodsStorage's actual JSON round-trip without a
// real native SQLite binding (unavailable under jest). Mocked at the expo-sqlite boundary so
// getDb()'s own table-creation/singleton code stays in play.
import type { CustomFood } from "@udine/shared";
import { SqliteCustomFoodsStorage, searchCustomFoods } from "./customFoodsStorage";

const mockRows = new Map<string, string>();

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => ({
    execAsync: async () => {},
    runAsync: async (sql: string, id: string, foodJson?: string) => {
      if (sql.startsWith("DELETE")) mockRows.delete(id);
      else mockRows.set(id, foodJson!);
    },
    getAllAsync: async () => [...mockRows.values()].map((food_json) => ({ food_json })),
  }),
}));

beforeEach(() => mockRows.clear());

function food(overrides: Partial<CustomFood> = {}): CustomFood {
  return {
    id: "c1",
    name: "Grandma's Lasagna",
    servingSize: "1 slice",
    nutrition: {
      servingSize: "1 slice",
      calories: 420,
      caloriesFromFat: 0,
      totalFatG: 18,
      satFatG: 8,
      transFatG: 0,
      cholesterolMg: 60,
      sodiumMg: 650,
      totalCarbG: 35,
      dietaryFiberG: 2,
      sugarsG: 4,
      proteinG: 22,
    },
    ...overrides,
  };
}

test("addCustomFood/getAllCustomFoods round-trips a food", async () => {
  const storage = new SqliteCustomFoodsStorage();
  await storage.addCustomFood(food());
  expect(await storage.getAllCustomFoods()).toEqual([food()]);
});

test("addCustomFood with an existing id replaces it, not duplicates it", async () => {
  const storage = new SqliteCustomFoodsStorage();
  await storage.addCustomFood(food({ name: "First" }));
  await storage.addCustomFood(food({ name: "Second" }));
  const all = await storage.getAllCustomFoods();
  expect(all).toHaveLength(1);
  expect(all[0].name).toBe("Second");
});

test("removeCustomFood deletes only the matching id", async () => {
  const storage = new SqliteCustomFoodsStorage();
  await storage.addCustomFood(food({ id: "a" }));
  await storage.addCustomFood(food({ id: "b" }));
  await storage.removeCustomFood("a");
  const all = await storage.getAllCustomFoods();
  expect(all.map((f) => f.id)).toEqual(["b"]);
});

test("getAllCustomFoods is empty before anything is added", async () => {
  const storage = new SqliteCustomFoodsStorage();
  expect(await storage.getAllCustomFoods()).toEqual([]);
});

describe("searchCustomFoods", () => {
  const foods = [food({ id: "a", name: "Grandma's Lasagna" }), food({ id: "b", name: "Homemade Chili" })];

  it("case-insensitive substring matches on name", () => {
    expect(searchCustomFoods(foods, "lasagna").map((f) => f.id)).toEqual(["a"]);
    expect(searchCustomFoods(foods, "LASAGNA").map((f) => f.id)).toEqual(["a"]);
  });

  it("returns nothing for a blank query", () => {
    expect(searchCustomFoods(foods, "  ")).toEqual([]);
  });

  it("returns nothing when nothing matches", () => {
    expect(searchCustomFoods(foods, "pizza")).toEqual([]);
  });
});
