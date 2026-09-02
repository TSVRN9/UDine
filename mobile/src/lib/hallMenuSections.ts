import { menuItemMatchesPreferences, type FoodPreferences, type MealPeriod, type MenuItem } from "@udine/shared";
import { plateKeyFor } from "./plate";

/** One station's worth of rows in the hall-menu SectionList -- same shape the [slug].tsx screen's
 * SectionList already renders, pulled out so a swipeable pane can compute its own without going
 * through the screen's single "whichever tab is selected" memo. */
export interface MenuSection {
  title: string;
  data: MenuItem[];
}

/** One real meal period's sections: `items` filtered to that period and the user's food
 * preferences, grouped by station (category) in first-seen order. Pulled verbatim out of
 * [slug].tsx's old single-tab `sections` memo (its non-Grab branch) so every mounted pane -- not
 * just the active one -- can compute its own tab's content for the swipe crossfade. */
export function sectionsForPeriod(items: MenuItem[], period: MealPeriod, prefs: FoodPreferences): MenuSection[] {
  const filtered = items.filter((i) => i.mealPeriod === period && menuItemMatchesPreferences(i, prefs));
  const categoriesInOrder: string[] = [];
  for (const i of filtered) {
    if (!categoriesInOrder.includes(i.category)) categoriesInOrder.push(i.category);
  }
  return categoriesInOrder.map((category) => ({
    title: category,
    data: filtered.filter((i) => i.category === category),
  }));
}

/** Grab 'N Go's own sections: same filter-by-preferences step, but grouped/deduped by dish
 * identity within a trimmed category instead of by raw mealPeriod -- Grab's items come back tagged
 * with ordinary breakfast/lunch/etc. mealPeriod values with no filtering by any of them, and the
 * same dish can appear twice under two different mealPeriod values sharing one trimmed category
 * (ported from the retired grab-n-go/[slug].tsx). Pulled verbatim out of [slug].tsx's old `sections`
 * memo (its Grab branch). */
export function grabSections(grabItems: MenuItem[], prefs: FoodPreferences): MenuSection[] {
  const filtered = grabItems.filter((i) => menuItemMatchesPreferences(i, prefs));
  const byCategory = new Map<string, Map<string, MenuItem>>();
  for (const item of filtered) {
    const title = item.category.trim();
    let bucket = byCategory.get(title);
    if (!bucket) {
      bucket = new Map();
      byCategory.set(title, bucket);
    }
    const key = plateKeyFor({ type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid });
    if (!bucket.has(key)) bucket.set(key, item);
  }
  return Array.from(byCategory, ([title, bucket]) => ({ title, data: Array.from(bucket.values()) }));
}
