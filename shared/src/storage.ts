import type { CustomFood, Favorite, LogEntry, RankedDish, RankedFood } from "./types.ts";

/**
 * Device-local persistence for health data. Implemented per-platform
 * (IndexedDB on web, SQLite on mobile) — this file only defines the contract
 * plus an in-memory implementation for tests. Nothing implementing this
 * interface may call a network API; that's the whole point (see CLAUDE.md
 * data residency table).
 */
export interface LogStorage {
  addEntry(entry: LogEntry): Promise<void>;
  removeEntry(id: string): Promise<void>;
  getEntriesForDate(isoDate: string): Promise<LogEntry[]>;
  getAllEntries(): Promise<LogEntry[]>;
}

export class InMemoryLogStorage implements LogStorage {
  private entries = new Map<string, LogEntry>();

  async addEntry(entry: LogEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async removeEntry(id: string): Promise<void> {
    this.entries.delete(id);
  }

  async getEntriesForDate(isoDate: string): Promise<LogEntry[]> {
    return [...this.entries.values()].filter((e) => e.loggedAt.startsWith(isoDate));
  }

  async getAllEntries(): Promise<LogEntry[]> {
    return [...this.entries.values()];
  }
}

/** JSON export of every local log entry — the "data never leaves the device unless exported" release valve. */
export function exportEntriesAsJson(entries: LogEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

const CSV_COLUMNS = ["id", "loggedAt", "dishName", "servings", "calories", "proteinG", "totalCarbG", "totalFatG"] as const;

/** Quote+escape one CSV field, shared by every export*AsCsv function below. Also guards against CSV
 * formula injection: a field starting with =/+/-/@ can be interpreted as a formula by
 * Excel/Sheets/etc. when the export is opened there, so a leading tab (invisible in the cell,
 * outside the quoted value's meaning) is prefixed first. `dishName` in particular is untrusted --
 * it round-trips through umassdining.com's feed HTML (`data-dish-name`). */
function csvField(value: string | number): string {
  const str = String(value);
  const safe = /^[=+\-@]/.test(str) ? `\t${str}` : str;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function exportEntriesAsCsv(entries: LogEntry[]): string {
  const rows = entries.map((e) => {
    const dishName = e.source.type === "umass-menu" ? e.source.dishName : e.source.productName;
    return [e.id, e.loggedAt, dishName, e.servings, e.nutrition.calories, e.nutrition.proteinG, e.nutrition.totalCarbG, e.nutrition.totalFatG]
      .map(csvField)
      .join(",");
  });
  return [CSV_COLUMNS.join(","), ...rows].join("\n");
}

// --- ranking (rankedDishes/rankedFoods) and favorites exporters -- the other two
// always-device-local stores per CLAUDE.md's data residency table ("every device-local table needs
// a JSON/CSV export path"). Same release-valve shape as the log exporters above: export IS the
// sanctioned way this data leaves the device, so these still never touch the network themselves.

/** JSON export of a device's per-hall RankedDish ratings (RankingStorage). */
export function exportRankedDishesAsJson(dishes: RankedDish[]): string {
  return JSON.stringify(dishes, null, 2);
}

const RANKED_DISH_CSV_COLUMNS = ["dishName", "hallTid", "rating", "comparisonCount"] as const;

export function exportRankedDishesAsCsv(dishes: RankedDish[]): string {
  const rows = dishes.map((d) => [d.dishName, d.hallTid, d.rating, d.comparisonCount].map(csvField).join(","));
  return [RANKED_DISH_CSV_COLUMNS.join(","), ...rows].join("\n");
}

/** JSON export of a device's cross-hall RankedFood ratings (FoodRankingStorage). */
export function exportRankedFoodsAsJson(foods: RankedFood[]): string {
  return JSON.stringify(foods, null, 2);
}

const RANKED_FOOD_CSV_COLUMNS = ["dishName", "rating", "comparisonCount"] as const;

export function exportRankedFoodsAsCsv(foods: RankedFood[]): string {
  const rows = foods.map((f) => [f.dishName, f.rating, f.comparisonCount].map(csvField).join(","));
  return [RANKED_FOOD_CSV_COLUMNS.join(","), ...rows].join("\n");
}

/** JSON export of a device's binary dish/location favorites (FavoritesStorage). */
export function exportFavoritesAsJson(favorites: Favorite[]): string {
  return JSON.stringify(favorites, null, 2);
}

const FAVORITE_CSV_COLUMNS = ["type", "dishName", "hallTid"] as const;

export function exportFavoritesAsCsv(favorites: Favorite[]): string {
  const rows = favorites.map((f) =>
    [f.type, f.type === "dish" ? f.dishName : "", f.type === "location" ? f.hallTid : ""].map(csvField).join(","),
  );
  return [FAVORITE_CSV_COLUMNS.join(","), ...rows].join("\n");
}

/** Device-local persistence for user-created custom foods (see CustomFood's own doc) -- same
 * device-only contract as FavoritesStorage/LogStorage above, no network call ever. */
export interface CustomFoodsStorage {
  addCustomFood(food: CustomFood): Promise<void>;
  removeCustomFood(id: string): Promise<void>;
  getAllCustomFoods(): Promise<CustomFood[]>;
}

/** JSON export of a device's custom foods (CustomFoodsStorage) -- release valve, same as every
 * other device-local store per CLAUDE.md's data residency table. */
export function exportCustomFoodsAsJson(foods: CustomFood[]): string {
  return JSON.stringify(foods, null, 2);
}

const CUSTOM_FOOD_CSV_COLUMNS = ["id", "name", "servingSize", "calories", "proteinG", "totalCarbG", "totalFatG", "ingredients"] as const;

export function exportCustomFoodsAsCsv(foods: CustomFood[]): string {
  const rows = foods.map((f) =>
    [f.id, f.name, f.servingSize, f.nutrition.calories, f.nutrition.proteinG, f.nutrition.totalCarbG, f.nutrition.totalFatG, f.ingredients ?? ""]
      .map(csvField)
      .join(","),
  );
  return [CUSTOM_FOOD_CSV_COLUMNS.join(","), ...rows].join("\n");
}
