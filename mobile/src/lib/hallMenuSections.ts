import { menuItemMatchesPreferences, normalizeStationName, sortStationNames, type FoodPreferences, type MealPeriod, type MenuItem } from "@udine/shared";
import { plateKeyFor } from "./plate";

/** One station's worth of rows in the hall-menu SectionList -- same shape the [slug].tsx screen's
 * SectionList already renders, pulled out so a swipeable pane can compute its own without going
 * through the screen's single "whichever tab is selected" memo. */
export interface MenuSection {
  title: string;
  data: MenuItem[];
}

/** One real meal period's sections: `items` filtered to that period and the user's food
 * preferences, grouped by normalized station name and ordered by sortStationNames (a fixed
 * food-journey order, not the feed's own item order) -- pulled verbatim out of [slug].tsx's old
 * single-tab `sections` memo (its non-Grab branch) so every mounted pane -- not just the active
 * one -- can compute its own tab's content for the swipe crossfade. */
export function sectionsForPeriod(items: MenuItem[], period: MealPeriod, prefs: FoodPreferences): MenuSection[] {
  const filtered = items.filter((i) => i.mealPeriod === period && menuItemMatchesPreferences(i, prefs));
  const categories = sortStationNames([...new Set(filtered.map((i) => normalizeStationName(i.category)))]);
  return categories.map((category) => ({
    title: category,
    data: filtered.filter((i) => normalizeStationName(i.category) === category),
  }));
}

/** Grab 'N Go's own sections: same filter-by-preferences and normalized/ordered station grouping
 * as sectionsForPeriod, but deduped by dish identity within a station instead of by raw
 * mealPeriod -- Grab's items come back tagged with ordinary breakfast/lunch/etc. mealPeriod values
 * with no filtering by any of them, and the same dish can appear twice under two different
 * mealPeriod values sharing one station (ported from the retired grab-n-go/[slug].tsx). */
export function grabSections(grabItems: MenuItem[], prefs: FoodPreferences): MenuSection[] {
  const filtered = grabItems.filter((i) => menuItemMatchesPreferences(i, prefs));
  const byCategory = new Map<string, Map<string, MenuItem>>();
  for (const item of filtered) {
    const title = normalizeStationName(item.category);
    let bucket = byCategory.get(title);
    if (!bucket) {
      bucket = new Map();
      byCategory.set(title, bucket);
    }
    const key = plateKeyFor({ type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid });
    if (!bucket.has(key)) bucket.set(key, item);
  }
  return sortStationNames([...byCategory.keys()]).map((title) => ({ title, data: Array.from(byCategory.get(title)!.values()) }));
}
