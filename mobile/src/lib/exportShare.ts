import {
  exportCustomFoodsAsCsv,
  exportCustomFoodsAsJson,
  exportEntriesAsCsv,
  exportEntriesAsJson,
  exportFavoritesAsCsv,
  exportFavoritesAsJson,
  exportRankedDishesAsCsv,
  exportRankedDishesAsJson,
  exportRankedFoodsAsCsv,
  exportRankedFoodsAsJson,
} from "@udine/shared";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { SqliteCustomFoodsStorage } from "./customFoodsStorage";
import { SqliteFavoritesStorage } from "./favoritesStorage";
import { SqliteLogStorage } from "./sqliteStorage";
import { SqliteRankingStorage } from "./rankingStorage";

const logStorage = new SqliteLogStorage();
const rankingStorage = new SqliteRankingStorage();
const favoritesStorage = new SqliteFavoritesStorage();
const customFoodsStorage = new SqliteCustomFoodsStorage();

export type ExportFormat = "json" | "csv";

/**
 * Extracted from YouPane.tsx (#182 -- the You pane's inline "Export Your Data" buttons are
 * replaced by the "Your data" screen's EXPORT row, which leads to the dedicated export screen
 * #183 builds on this module). Writes `content` to the cache dir and hands it to the OS share
 * sheet -- the common tail of every export* function below, regardless of which store/format it
 * came from.
 */
export async function shareExport(baseName: string, format: ExportFormat, content: string) {
  const path = `${FileSystem.cacheDirectory}${baseName}.${format}`;
  await FileSystem.writeAsStringAsync(path, content);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path);
  }
}

export async function exportLog(format: ExportFormat) {
  // Fresh read, not a stale render's state -- a just-removed entry can otherwise still be in a
  // cached list if export is tapped before a remove()'s reload flushes. Matches today.tsx's
  // original behavior (ported from, see PR #105's review).
  const entries = await logStorage.getAllEntries();
  const content = format === "json" ? exportEntriesAsJson(entries) : exportEntriesAsCsv(entries);
  await shareExport("udine-export", format, content);
}

export async function exportRankedDishes(format: ExportFormat) {
  const dishes = await rankingStorage.getRankedDishes();
  const content = format === "json" ? exportRankedDishesAsJson(dishes) : exportRankedDishesAsCsv(dishes);
  await shareExport("udine-ranked-dishes", format, content);
}

export async function exportRankedFoods(format: ExportFormat) {
  const foods = await rankingStorage.getRankedFoods();
  const content = format === "json" ? exportRankedFoodsAsJson(foods) : exportRankedFoodsAsCsv(foods);
  await shareExport("udine-ranked-foods", format, content);
}

export async function exportFavorites(format: ExportFormat) {
  const favorites = await favoritesStorage.getFavorites();
  const content = format === "json" ? exportFavoritesAsJson(favorites) : exportFavoritesAsCsv(favorites);
  await shareExport("udine-favorites", format, content);
}

export async function exportCustomFoods(format: ExportFormat) {
  const foods = await customFoodsStorage.getAllCustomFoods();
  const content = format === "json" ? exportCustomFoodsAsJson(foods) : exportCustomFoodsAsCsv(foods);
  await shareExport("udine-custom-foods", format, content);
}
