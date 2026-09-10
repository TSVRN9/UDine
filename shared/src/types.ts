export interface DiningHall {
  /** Drupal taxonomy term id — the id foodpro-menu-ajax expects as `tid`. */
  tid: number;
  slug: string;
  name: string;
}

// "latenight" added for #117 (mobile hall-menu meal tabs) -- the raw foodpro-menu-ajax feed
// really does publish a 4th meal period on some hall/date combos, wire key "late night" (with a
// literal space; see umassDining.ts's fetchMenu), confirmed live 2026-08-21 (Worcester, 08/21/2026:
// {"lunch":...,"dinner":...,"late night":...}). Previously silently dropped -- MEAL_PERIODS in
// umassDining.ts only ever looked up "breakfast"/"lunch"/"dinner".
//
// "allday" and "grabngo" added for #175 -- retail-only wire keys "daily offerings" and "grabngo"
// (confirmed live 2026-08-24: People's Organic Coffee tid=32 returns ["daily offerings","grabngo"],
// Harvest Market tid=4306 returns ["breakfast","lunch","grabngo","dinner"]). These exist purely so
// fetchMenu doesn't silently drop retail items -- they are NOT part of MEAL_PERIODS (the hall-tab
// consolidation pinned by #144/#160/#163) and hall UIs must never render them as a tab. See
// umassDining.ts's RAW_MEAL_PERIOD_KEYS/MEAL_PERIODS split for the enforcement.
export type MealPeriod = "breakfast" | "lunch" | "dinner" | "latenight" | "allday" | "grabngo";

/** The 4 periods a hall's own hours/menu tabs can actually be in -- MealPeriod's retail-only
 * members ("allday"/"grabngo", #175) never apply to a hall: DiningHallHours only has fields for
 * these four (plus "general"), and MEAL_PERIODS/currentMealPeriod never produce anything else.
 * Exists so hall-only code can index DiningHallHours by a dynamic key without tsc widening it to
 * MealPeriod's full, retail-inclusive union. */
export type HallMealPeriod = "breakfast" | "lunch" | "dinner" | "latenight";

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
  // %DV fields, additive (#91) — scraped straight from foodpro-menu-ajax's own data-*-dv attributes,
  // not computed client-side. Optional: OpenFoodFacts-sourced items never populate these (OFF has no
  // %DV field), and web/existing constructors of NutritionFacts predate this and don't set them either.
  // null means the attribute was present but blank (e.g. trans fat has no established FDA %DV);
  // undefined means the source has no concept of %DV at all (e.g. OpenFoodFacts).
  totalFatDv?: number | null;
  satFatDv?: number | null;
  cholesterolDv?: number | null;
  sodiumDv?: number | null;
  totalCarbDv?: number | null;
  dietaryFiberDv?: number | null;
  sugarsDv?: number | null;
  proteinDv?: number | null;
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
  // #176: retail-only. Parsed verbatim from the feed's `<span class="meal-price">$3.00</span>`
  // (parseCategoryItems) -- kept as the feed's own display string (currency symbol included), not
  // split into number+currency: halls have no such span, so this stays absent there, and every
  // known retail price is USD, so a currency field would carry no information a fixed "$" prefix
  // doesn't already convey.
  price?: string;
  // Raw prose from the feed's data-ingredient-list (e.g. "Local Pizza Dough (It'll Be Dough:
  // Enriched Flour (...), ...), Shredded Mozzarella Cheese (...)") -- a free-text ingredient
  // statement with its own nested parens, not a clean tag list like allergens/dietTags, so this
  // stays a single string rather than string[].
  ingredients?: string;
}

/** One food-logging entry. Device-local only — never sent to the server. */
export interface LogEntry {
  id: string;
  loggedAt: string; // ISO 8601
  source:
    | { type: "umass-menu"; dishName: string; hallTid: number }
    | { type: "off"; barcode: string; productName: string }
    | { type: "usda"; fdcId: string; productName: string }
    | { type: "custom"; customFoodId: string; productName: string };
  servings: number;
  nutrition: NutritionFacts; // snapshot at log time — menu nutrition can change day to day
}

/**
 * A manually-entered food with no database backing it (a homemade recipe, a friend's cooking) --
 * device-local only, always, same residency posture as everything else in this table (no
 * auth.uid() gate, never synced to Supabase -- see CLAUDE.md's data residency table and #91's
 * PlateSheet add-item flow, which this is a 4th search source for). `ingredients` is free-text,
 * user-typed, optional -- same shape as MenuItem.ingredients.
 */
export interface CustomFood {
  id: string;
  name: string;
  servingSize: string;
  nutrition: NutritionFacts;
  ingredients?: string;
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
  // Menu-filters-macros (#320ish): which macro badges (see MacroPreset/menuItemMacroBadges below) are
  // currently enabled. Optional, not required -- mobile's preferences.ts migrates a pre-feature stored
  // blob (and a genuinely fresh one) to a real array (["high-protein","high-fiber"]) on read, but web's
  // own preferences.ts/routes (out of scope for this change, #311-adjacent) don't set this field at
  // all, so `undefined` is a real value this type has to admit, not just an implementation detail.
  macroPresets?: MacroPreset[];
}

export function menuItemMatchesPreferences(item: MenuItem, prefs: FoodPreferences): boolean {
  const hasExcludedAllergen = item.allergens.some((a) => prefs.allergensToAvoid.includes(a));
  if (hasExcludedAllergen) return false;
  return prefs.requiredDietTags.every((tag) => item.dietTags.includes(tag));
}

/** Informational macro badges (menu-filters-macros) -- unlike allergens/dietTags above, these never
 * exclude anything from a menu; they only flag which of the caller's *enabled* presets an item
 * qualifies for, for rendering a small badge next to the dish. Thresholds are FDA-grounded and fixed
 * (not user-configurable): "high" nutrient claims sit at >=20% DV-ish absolute cuts, "low"/"under" at
 * conservative absolute caps. Order returned follows `prefs.macroPresets`'s own order, not a fixed
 * canonical one -- purely informational, so there's no "correct" order to enforce. */
export type MacroPreset = "high-protein" | "low-sodium" | "under-500-cal" | "low-fat" | "high-fiber";

const MACRO_PRESET_CHECKS: Record<MacroPreset, (n: NutritionFacts) => boolean> = {
  // FDA "high"/"excellent source" claim = >=20% of the 50g protein DV, i.e. 10g -- was 20g (40%
  // DV), which contradicted this file's own stated rationale and under-badged real high-protein
  // dishes.
  "high-protein": (n) => n.proteinG >= 10,
  "low-sodium": (n) => n.sodiumMg <= 400,
  "under-500-cal": (n) => n.calories <= 500,
  // Absolute per-serving cap (standard "low fat" labeling convention), not a calorie ratio -- a
  // ratio both under- and over-badges: it fails a near-zero-fat, near-zero-calorie condiment
  // (their ratio is high even though the fat content isn't) and passes a high-fat, high-calorie
  // dish at the same ratio. This matches the "conservative absolute caps" the doc comment above
  // already promises for "low"/"under" presets.
  "low-fat": (n) => n.totalFatG <= 3,
  "high-fiber": (n) => n.dietaryFiberG >= 5,
};

export function menuItemMacroBadges(item: MenuItem, prefs: FoodPreferences): MacroPreset[] {
  return (prefs.macroPresets ?? []).filter((preset) => MACRO_PRESET_CHECKS[preset](item.nutrition));
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
 * currentMealPeriod. HallMealPeriod, not MealPeriod (#175) -- currentMealPeriod only ever checks
 * DiningHallHours's 4 per-meal fields, so its return value can never be a retail-only period. */
export type MealStatus = HallMealPeriod | "closed";

/** One dining hall's hours for "today" as published by get_infov2, keyed to DINING_HALLS by tid. */
export interface DiningHallHours {
  hallTid: number;
  breakfast: TimeWindow | null;
  lunch: TimeWindow | null;
  dinner: TimeWindow | null;
  latenight: TimeWindow | null;
  general: TimeWindow | null; // opening_hours/closing_hours -- published when there's no per-meal breakdown
  // #180: the hall-info sheet's address/DIRECTIONS row. Both parsed out of get_infov2 fields this
  // module previously dropped entirely -- see hours.ts's parseStreetAddress/parseMapAddress.
  // Optional (not just nullable): mapInfoV2 is the only real producer and always sets both, but
  // homeHero.ts's singleWindowStatus/retailOpenStatus wrap a bare TimeWindow as a hand-built
  // DiningHallHours to reuse openStatus's math, and don't have an address to report -- `?` lets
  // those omit the fields instead of stubbing null onto a "hall" that isn't a real one.
  address?: string | null; // street line only (e.g. "121 Southwest Cir"), null if unparseable
  mapAddress?: string | null; // "lat,long" as published, shape-validated; null if absent/malformed
}

export interface RetailLocationHours {
  name: string;
  hours: TimeWindow | null; // null when the feed reports "Closed"
  // #176: café-tap prerequisite plumbing. get_infov2's location_id IS the foodpro-menu-ajax tid for
  // this location (confirmed live 2026-08-24: Green Fields 4671, Harvest Market 4306, People's
  // Organic Coffee 32 -- also true of the 4 commons, e.g. Berkshire Dining Commons location_id=4
  // matches DINING_HALLS' own tid=4). Optional -- degrades to undefined rather than throwing if a
  // future capture omits or mangles it (mapInfoV2's existing trust-boundary posture, same as
  // InfoV2Location's optional per-meal time fields in hours.ts).
  locationId?: number;
  // Raw HTML price-list fragments straight off the feed, one per meal period -- store RAW, sanitize
  // at render (clients own that). null when the feed publishes "" (no menu for that meal here) or
  // omits the field entirely; babyBerk/Commonwealth Restaurant embed a PDF link here instead of an
  // item list, still just an HTML string.
  breakfastMenu?: string | null;
  lunchMenu?: string | null;
  dinnerMenu?: string | null;
  description?: string; // short_description_v2, raw HTML
  address?: string; // raw HTML
  mapAddress?: string; // "lat,long" as published, NOT parsed -- babyBerk's degenerate "," passes through untouched
  acceptedPayment?: string;
}

export interface DiningHoursFeed {
  halls: DiningHallHours[]; // exactly the 4 DINING_HALLS, matched by name
  retail: RetailLocationHours[]; // everything else in the get_infov2 feed
}

export type OpenStatus = { open: true; closesAt: Date } | { open: false; opensAt: Date | null };
