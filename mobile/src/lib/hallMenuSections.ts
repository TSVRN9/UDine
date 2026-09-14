import { menuItemMatchesPreferences, normalizeStationName, sortStationNames, type FoodPreferences, type MealPeriod, type MenuItem } from "@udine/shared";
import { plateKeyFor } from "./plate";

/** One station's worth of rows in the hall-menu SectionList -- same shape the [slug].tsx screen's
 * SectionList already renders, pulled out so a swipeable pane can compute its own without going
 * through the screen's single "whichever tab is selected" memo. */
export interface MenuSection {
  title: string;
  data: MenuItem[];
}

/** [slug].tsx's meal-period SectionList keyExtractor, pulled out so the collision it guards
 * against is unit-testable without mounting the screen. Includes `item.date`, not just
 * category+dishName+index: an always-available tail station (alwaysAvailableStations.ts, whose
 * synthesized items carry `date: ""`) can share a category, dish name, AND position with a REAL
 * same-named feed station on a day it happens to also serve that dish -- confirmed live,
 * Hampshire's own daily feed served an identical 3-item "Pizza" station the same day this was
 * verified. Without `date` those two rows compute the exact same key, which RN logs as a
 * duplicate-key warning; real items' real fetch date never matches the synthesized "" sentinel. */
export function dishRowKey(item: MenuItem, index: number): string {
  return `${item.category}-${item.dishName}-${item.date}-${index}`;
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

/** Moves the section titled `title` (if present) to the front of `sections`, in place. Used by
 * [slug].tsx's dev-only stress fixture: sortStationNames places an unrecognized category
 * alphabetically after every real station (its own doc comment), which for a synthetic "Stress
 * Test" section means the very bottom of a long list -- the opposite of "visible without
 * scrolling" a screenshot-based repro needs. A no-op when `title` isn't found (e.g. the fixture is
 * off, or the user's own allergen/diet-tag filters hid it -- menuItemMatchesPreferences runs before
 * this ever sees the list). */
export function moveSectionToFront(sections: MenuSection[], title: string): MenuSection[] {
  const index = sections.findIndex((s) => s.title === title);
  if (index > 0) sections.unshift(sections.splice(index, 1)[0]);
  return sections;
}
