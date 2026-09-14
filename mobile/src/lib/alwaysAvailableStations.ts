import { ALWAYS_AVAILABLE_STATIONS, menuItemMatchesPreferences, type FoodPreferences, type MealPeriod, type MenuItem } from "@udine/shared";
import type { CachedDishCatalog } from "./dishCatalog";
import type { MenuSection } from "./hallMenuSections";

/**
 * The always-available station tail section (Salad Bar / Pizza -- see docs/design/canvas.json's
 * "unlisted-station-logic" annotation and shared's ALWAYS_AVAILABLE_STATIONS, the curated catalog
 * this reads from) for one hall. Callers append the result to sectionsForPeriod's own per-period
 * sections -- IDENTICAL in every meal-period tab (the `period` argument only fills MenuItem's
 * required `mealPeriod` field so these items can flow through the same DishRow/addToPlate/
 * menuItemMatchesPreferences pipeline a feed-driven dish already uses; it never filters anything,
 * unlike sectionsForPeriod's own `period` param).
 *
 * Nutrition comes from the local dish-catalog cache (dishCatalog.ts, same one PlateSheet search
 * already reads) -- not the curated list itself, which only carries names. A dish the catalog
 * hasn't synced yet is silently skipped, and a station left with zero resolved dishes renders no
 * block at all -- same "blank = doesn't exist" convention a hall lacking the station outright
 * already follows (never a placeholder row/message).
 */
export function alwaysAvailableSections(hallTid: number | undefined, catalog: CachedDishCatalog | null, prefs: FoodPreferences, period: MealPeriod): MenuSection[] {
  if (hallTid === undefined || !catalog) return [];
  const byName = new Map(catalog.entries.map((e) => [e.dishName, e]));
  const sections: MenuSection[] = [];
  for (const station of ALWAYS_AVAILABLE_STATIONS) {
    if (station.hallTid !== hallTid) continue;
    const data: MenuItem[] = [];
    for (const dishName of station.dishNames) {
      const entry = byName.get(dishName);
      if (!entry) continue;
      const item: MenuItem = {
        dishName,
        category: station.station,
        mealPeriod: period,
        hallTid,
        date: "", // not date-scoped -- see unlisted-station-logic annotation; unused downstream (plateKeyFor/menuItemToPlateEntry key off dishName+hallTid only)
        nutrition: entry.nutrition,
        allergens: entry.allergens,
        dietTags: entry.dietTags,
      };
      if (menuItemMatchesPreferences(item, prefs)) data.push(item);
    }
    if (data.length > 0) sections.push({ title: station.station, data });
  }
  return sections;
}
