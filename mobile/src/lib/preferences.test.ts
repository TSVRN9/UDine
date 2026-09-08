// Menu-filters-macros: one-time migration for FoodPreferences.macroPresets. Pre-feature stored
// blobs (and a genuinely never-set store) have no macroPresets field at all -- both must read back
// as the approved sensible default (["high-protein","high-fiber"]), never an empty array, and
// without dropping the caller's existing allergensToAvoid/requiredDietTags. Same fake expo-sqlite
// technique as dishCatalog.test.ts -- mocked at the expo-sqlite boundary so getDb()'s own
// table-creation/singleton code stays in play.

import { getPreferences, setPreferences } from "./preferences";

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

beforeEach(() => {
  mockRows.clear();
});

describe("getPreferences macroPresets migration", () => {
  it("defaults a never-set store to high-protein/high-fiber", async () => {
    const prefs = await getPreferences();
    expect(prefs.macroPresets).toEqual(["high-protein", "high-fiber"]);
  });

  it("migrates a pre-feature stored blob (no macroPresets field) without dropping allergensToAvoid/requiredDietTags", async () => {
    mockRows.set("food_preferences", JSON.stringify({ allergensToAvoid: ["Milk"], requiredDietTags: ["Vegan"] }));
    const prefs = await getPreferences();
    expect(prefs).toEqual({ allergensToAvoid: ["Milk"], requiredDietTags: ["Vegan"], macroPresets: ["high-protein", "high-fiber"] });
  });

  it("leaves an already-migrated store's macroPresets untouched, including a deliberate empty array", async () => {
    mockRows.set("food_preferences", JSON.stringify({ allergensToAvoid: [], requiredDietTags: [], macroPresets: [] }));
    const prefs = await getPreferences();
    expect(prefs.macroPresets).toEqual([]);
  });

  it("round-trips through setPreferences unmigrated (already has the field, no re-default)", async () => {
    await setPreferences({ allergensToAvoid: [], requiredDietTags: [], macroPresets: ["low-sodium"] });
    const prefs = await getPreferences();
    expect(prefs.macroPresets).toEqual(["low-sodium"]);
  });
});
