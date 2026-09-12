import type { FoodPreferences, MacroPreset } from "@udine/shared";
import { getDb } from "./db";

const KEY = "food_preferences";
// Menu-filters-macros: the approved sensible default, both for a genuinely never-set store and for
// migrating a pre-feature stored blob (which has no macroPresets field at all) -- never an empty
// array, see getPreferences below.
const DEFAULT_MACRO_PRESETS: MacroPreset[] = ["high-protein", "high-fiber"];
const DEFAULT: FoodPreferences = { allergensToAvoid: [], requiredDietTags: [], macroPresets: DEFAULT_MACRO_PRESETS };

// In-memory mirror of the last value read/written, warmed by a fire-and-forget getPreferences()
// call at app launch (_layout.tsx, same pattern as menuPrefetch's prefetchTodaysMenus). Lets a
// screen seed its initial state synchronously instead of painting a placeholder and popping the
// real value in a frame later -- see getCachedPreferences below.
let cache: FoodPreferences | undefined;

export async function getPreferences(): Promise<FoodPreferences> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM preferences_kv WHERE key = ?", KEY);
  if (!row) {
    cache = DEFAULT;
    return DEFAULT;
  }
  const parsed = JSON.parse(row.value_json) as FoodPreferences;
  // One-time migration: a stored blob from before this feature has no macroPresets key at all
  // (`undefined`, not an empty array) -- treat that as the same sensible default, without touching
  // whatever allergensToAvoid/requiredDietTags the user already had saved. An already-migrated store
  // (macroPresets present, even `[]` for a deliberate "no badges" choice) passes through untouched.
  const result = parsed.macroPresets === undefined ? { ...parsed, macroPresets: DEFAULT_MACRO_PRESETS } : parsed;
  cache = result;
  return result;
}

/** Synchronous last-known-good preferences, or undefined before anything has warmed it. */
export function getCachedPreferences(): FoodPreferences | undefined {
  return cache;
}

export async function setPreferences(prefs: FoodPreferences): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO preferences_kv (key, value_json) VALUES (?, ?)", KEY, JSON.stringify(prefs));
  cache = prefs;
}

// Pure toggle-in-list helpers -- pulled out of filters.tsx (menu-filters-macros) so FilterSheet.tsx
// can share the exact same allergen/diet-tag edit logic instead of re-implementing it. Callers still
// own persistence (setPrefs + setPreferences), these just compute the next value.
function toggleInList<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function toggleAllergen(prefs: FoodPreferences, allergen: string): FoodPreferences {
  return { ...prefs, allergensToAvoid: toggleInList(prefs.allergensToAvoid, allergen) };
}

export function toggleDietTag(prefs: FoodPreferences, tag: string): FoodPreferences {
  return { ...prefs, requiredDietTags: toggleInList(prefs.requiredDietTags, tag) };
}

export function toggleMacroPreset(prefs: FoodPreferences, preset: MacroPreset): FoodPreferences {
  return { ...prefs, macroPresets: toggleInList(prefs.macroPresets ?? [], preset) };
}
