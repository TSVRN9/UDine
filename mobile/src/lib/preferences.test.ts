// Menu-filters-macros: one-time migration for FoodPreferences.macroPresets. Pre-feature stored
// blobs (and a genuinely never-set store) have no macroPresets field at all -- both must read back
// as the approved sensible default (["high-protein","high-fiber"]), never an empty array, and
// without dropping the caller's existing allergensToAvoid/requiredDietTags. Same fake expo-sqlite
// technique as dishCatalog.test.ts -- mocked at the expo-sqlite boundary so getDb()'s own
// table-creation/singleton code stays in play.

import type { FoodPreferences } from "@udine/shared";
import { getCachedPreferences, getPreferences, setPreferences, toggleAllergen, toggleDietTag, toggleMacroPreset } from "./preferences";

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

// Badge-pop-in fix: halls/[slug].tsx and filters.tsx seed their initial state from
// getCachedPreferences() instead of a bare placeholder, so a screen mounted after the cache has
// been warmed (a fire-and-forget getPreferences() call at app launch, _layout.tsx) never renders
// a frame with the wrong prefs first.
describe("getCachedPreferences", () => {
  it("reflects the value getPreferences last resolved, synchronously", async () => {
    mockRows.set("food_preferences", JSON.stringify({ allergensToAvoid: [], requiredDietTags: [], macroPresets: ["high-protein"] }));
    const resolved = await getPreferences();
    expect(getCachedPreferences()).toEqual(resolved);
  });

  it("reflects a setPreferences write immediately, without needing a fresh getPreferences read", async () => {
    const written: FoodPreferences = { allergensToAvoid: ["Milk"], requiredDietTags: [], macroPresets: ["low-sodium"] };
    await setPreferences(written);
    expect(getCachedPreferences()).toEqual(written);
  });
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

// pr-reviewer (#362 REQUEST-CHANGES, finding 2): mutating toggleAllergen to a no-op (`return prefs`)
// left the full mobile suite green -- nothing exercised these pure functions directly. Direct tests
// on the exact functions the mutation targeted, so a future no-op/wrong-field mutation fails here
// immediately rather than depending on some caller happening to assert on the result.
describe("toggleAllergen/toggleDietTag/toggleMacroPreset (pure)", () => {
  const BASE: FoodPreferences = { allergensToAvoid: ["Milk"], requiredDietTags: ["Vegan"], macroPresets: ["high-fiber"] };

  it("toggleAllergen adds an absent allergen and removes a present one, leaving other fields untouched", () => {
    expect(toggleAllergen(BASE, "Gluten")).toEqual({ ...BASE, allergensToAvoid: ["Milk", "Gluten"] });
    expect(toggleAllergen(BASE, "Milk")).toEqual({ ...BASE, allergensToAvoid: [] });
  });

  it("toggleDietTag adds an absent tag and removes a present one, leaving other fields untouched", () => {
    expect(toggleDietTag(BASE, "Halal")).toEqual({ ...BASE, requiredDietTags: ["Vegan", "Halal"] });
    expect(toggleDietTag(BASE, "Vegan")).toEqual({ ...BASE, requiredDietTags: [] });
  });

  it("toggleMacroPreset adds an absent preset and removes a present one, leaving other fields untouched", () => {
    expect(toggleMacroPreset(BASE, "high-protein")).toEqual({ ...BASE, macroPresets: ["high-fiber", "high-protein"] });
    expect(toggleMacroPreset(BASE, "high-fiber")).toEqual({ ...BASE, macroPresets: [] });
  });

  it("toggleMacroPreset treats a missing macroPresets field (pre-migration blob) as empty, not a crash", () => {
    const noMacros = { allergensToAvoid: [], requiredDietTags: [] } as FoodPreferences;
    expect(toggleMacroPreset(noMacros, "low-sodium")).toEqual({ ...noMacros, macroPresets: ["low-sodium"] });
  });
});
