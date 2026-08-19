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

/** One newsletter issue — a link to externally-hosted content, not an in-app article (see fetchNewsletter). */
export interface NewsletterIssue {
  period: string; // e.g. "February 2020"
  link: string; // external URL, mostly Mailchimp/campaign-archive
  content: string; // HTML, usually empty — real content lives at `link`
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

/**
 * A dish's identity by name alone, independent of which hall serves it — the cross-hall "Favorite
 * Food" Elo track, see docs/adr/0001-two-elo-tracks-for-dish-ranking.md. Two halls both serving
 * "Chicken Parm" feed the same RankedFood. Updated by the same Pairwise Comparison event as
 * RankedDish, except a comparison between the same dishName at two different halls, which updates
 * only the per-hall RankedDish and leaves this track untouched (see ranking.ts's applyFoodComparison).
 */
export interface RankedFood {
  dishName: string;
  rating: number;
  comparisonCount: number;
}

/**
 * Device-only, always, same as RankingStorage above and for the same reason — a cross-hall favorite
 * food ranking is exactly as reconstructible into "what/how much they ate" as the per-hall one, so it
 * gets the same data residency treatment per CLAUDE.md: never synced to Supabase, no network call, ever.
 */
export interface FoodRankingStorage {
  getRankedFoods(): Promise<RankedFood[]>;
  saveRankedFoods(foods: RankedFood[]): Promise<void>;
}

/** One open/close window in the feed's published wall-clock time (Eastern, no offset in the feed
 * itself -- see hours.ts's atLocalTime doc). */
export interface TimeWindow {
  openTime: string; // "H:MM AM/PM" or "HH:MM AM/PM" as published by get_infov2
  closeTime: string;
}

/** breakfast/lunch/dinner/late-night derivation states, plus "closed" -- see hours.ts's
 * currentMealPeriod. */
export type MealStatus = MealPeriod | "latenight" | "closed";

/** One dining hall's hours for "today" as published by get_infov2, keyed to DINING_HALLS by tid. */
export interface DiningHallHours {
  hallTid: number;
  breakfast: TimeWindow | null;
  lunch: TimeWindow | null;
  dinner: TimeWindow | null;
  latenight: TimeWindow | null;
  general: TimeWindow | null; // opening_hours/closing_hours -- published when there's no per-meal breakdown
}

export interface RetailLocationHours {
  name: string;
  hours: TimeWindow | null; // null when the feed reports "Closed"
}

export interface DiningHoursFeed {
  halls: DiningHallHours[]; // exactly the 4 DINING_HALLS, matched by name
  retail: RetailLocationHours[]; // everything else in the get_infov2 feed
}

export type OpenStatus = { open: true; closesAt: Date } | { open: false; opensAt: Date | null };
