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
