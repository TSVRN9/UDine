export interface DiningHall {
  /** Drupal taxonomy term id — the id foodpro-menu-ajax expects as `tid`. */
  tid: number;
  slug: string;
  name: string;
}

export type MealPeriod = "breakfast" | "lunch" | "dinner";

export interface NutritionFacts {
  servingSize: string;
  calories: number;
  caloriesFromFat: number;
  totalFatG: number;
  satFatG: number;
  transFatG: number;
  cholesterolMg: number;
  sodiumMg: number;
  totalCarbG: number;
  dietaryFiberG: number;
  sugarsG: number;
  proteinG: number;
}

export interface MenuItem {
  dishName: string;
  category: string;
  mealPeriod: MealPeriod;
  hallTid: number;
  date: string; // YYYY-MM-DD
  nutrition: NutritionFacts;
  allergens: string[];
  dietTags: string[]; // e.g. "Vegan", "Halal", "Whole Grain" — from data-clean-diet-str
}

/** One food-logging entry. Device-local only — never sent to the server. */
export interface LogEntry {
  id: string;
  loggedAt: string; // ISO 8601
  source: { type: "umass-menu"; dishName: string; hallTid: number } | { type: "off"; barcode: string; productName: string };
  servings: number;
  nutrition: NutritionFacts; // snapshot at log time — menu nutrition can change day to day
}

export interface DailyMacroTotals {
  date: string; // YYYY-MM-DD
  calories: number;
  proteinG: number;
  totalCarbG: number;
  totalFatG: number;
}

/** Dietary/allergen filter preferences. Device-local — not health data, but no reason to sync it either. */
export interface FoodPreferences {
  allergensToAvoid: string[]; // matches values in MenuItem.allergens, e.g. "Milk", "Gluten"
  requiredDietTags: string[]; // matches values in MenuItem.dietTags, e.g. "Vegan", "Halal" — item must have ALL of these
}

export function menuItemMatchesPreferences(item: MenuItem, prefs: FoodPreferences): boolean {
  const hasExcludedAllergen = item.allergens.some((a) => prefs.allergensToAvoid.includes(a));
  if (hasExcludedAllergen) return false;
  return prefs.requiredDietTags.every((tag) => item.dietTags.includes(tag));
}

export type Favorite = { type: "dish"; dishName: string } | { type: "location"; hallTid: number };

/** Binary favorites (dish or location) — device-local for anonymous users, see CLAUDE.md data residency table. */
export interface FavoritesStorage {
  addFavorite(favorite: Favorite): Promise<void>;
  removeFavorite(favorite: Favorite): Promise<void>;
  getFavorites(): Promise<Favorite[]>;
}

export function favoriteKey(favorite: Favorite): string {
  return favorite.type === "dish" ? `dish:${favorite.dishName}` : `location:${favorite.hallTid}`;
}

export interface PressRelease {
  title: string;
  url: string;
  image: string;
  date: string; // YYYY-MM-DD
}

export interface DiningEvent {
  title: string;
  featuredImage: string;
  pdfLink: string;
  externalLink: string;
  expirationDate: string; // ISO 8601, converted from the API's unix-seconds field
  isFeatured: boolean;
}

export interface FaqItem {
  title: string;
  content: string; // HTML
}

export interface FaqCategory {
  name: string;
  items: FaqItem[];
}

/**
 * A dish the user has rated via pairwise comparison, plus the dining hall it was rated at (the same
 * dish name can be rated separately per hall — "chicken at Worcester" and "chicken at Berkshire" are
 * different experiences). See ranking.ts for the comparison/rating math.
 */
export interface RankedDish {
  dishName: string;
  hallTid: number;
  rating: number;
  comparisonCount: number;
}

/**
 * The ranking system — pairwise comparisons AND the computed rank order they produce — is
 * device-only, always, per CLAUDE.md's data residency table: a per-dish rank order is reconstructible
 * into "what/how much they ate," the same sensitivity as the raw log. Only the ranked portion of
 * `rankDiningHalls`'s output (ranking.ts), a coarse hall-level summary, may ever leave the device, and
 * only if the user signs in.
 */
export interface RankingStorage {
  getRankedDishes(): Promise<RankedDish[]>;
  saveRankedDishes(dishes: RankedDish[]): Promise<void>;
}
