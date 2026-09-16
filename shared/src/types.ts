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
 * qualifies for, for rendering a small badge next to the dish. Order returned follows
 * `prefs.macroPresets`'s own order, not a fixed canonical one -- purely informational, so there's
 * no "correct" order to enforce -- with one exception: `high-protein` suppresses `high-fiber` when
 * a dish qualifies for both (see `menuItemMacroBadges`). */
export type MacroPreset = "high-protein" | "low-sodium" | "under-300-cal" | "low-fat" | "high-fiber";

// Thresholds checked against a live pull of all 4 halls' full-day menus (356 distinct dishes,
// 2026-09-11): "high-protein" at the FDA >=20%-DV cut (10g) already split the menu usefully
// (18.8% pass). The others didn't -- "under-500-cal"/"low-sodium" at their old values matched
// 99.4%/78.9% of dishes (real entrees rarely list a single component over 500 cal), and
// "high-fiber" at the FDA >=20%-DV cut (5.6g) matched only 1.7%. Recalibrated against that same
// data instead of by eye: under-300-cal / low-sodium(140mg, FDA's actual "low sodium" cut, not
// the old 400) / high-fiber(2g) land at 93%/45.5%/19.7% -- each one now splits the real menu.
// low-fat's FDA cut (3g) was already fine (42.4%) and is unchanged.
//
// high-fiber recalibrated again, 2026-09-15 (another live pull, all 4 halls' full-day menus, 361
// distinct dishes): the flat >=2g gram cut can't tell "genuinely fiber-dense food" from "high-
// calorie food that happens to contain some fiber" -- whole-grain-crust pizza (real captured data,
// umassDining.test.ts's REAL_HARVEST_MARKET_PIZZA_FRAGMENT: 445-569 cal, 5-6g fiber) clears >=2g
// on fiber-from-crust while sitting at only 0.62-1.44g fiber per 100kcal (the pull's highest pizza
// density, Vegetable Pizza, was 1.436 -- a real but thin 4% margin below the cutoff below).
// Replaced with a density check (fiber per 100kcal) plus an absolute gram floor, both recalibrated
// against the same pull, not just the gram cut inherited unchanged: a 2g floor turned out to
// exclude real fiber-dense dishes near it (BUSH's Baked Beans, 1.9g/63cal, density 3.02 -- clearly
// fiber-dense, just short of 2g), while every trace-fiber garnish/condiment in the pull (Banana
// Peppers 0.5g/3cal, Romaine Lettuce 0.6g/5cal, and the rest of the pull's garnish items) sits at
// 0.1-0.6g fiber -- far enough under 1.5g that lowering the floor to 1.5g still excludes every one
// of them while admitting BUSH's Baked Beans and similar roasted-vegetable/legume/hummus dishes
// that were being wrongly excluded. >=1.5g/100kcal density excludes every pizza in the pull (the
// nearest, Vegetable Pizza, at a 4% margin) and every high-calorie composite dish (wraps, burrito
// bowls) whose fiber grams are just diluted by calories, while >=1.5g absolute keeps a near-zero-
// calorie garnish from qualifying on density alone. Both gates together land at 18.3% pass
// (66/361) -- still catches genuinely fiber-dense low-cal foods (beans, chana dal, roasted
// vegetables, hummus, whole grain penne, steamed broccoli, kale).
// Both landed on 1.5 independently -- different units (absolute grams vs. grams per 100kcal), a
// coincidence of this pull's data, not a shared constant.
const MIN_FIBER_G = 1.5;
const FIBER_DENSITY_PER_100_KCAL = 1.5;

const MACRO_PRESET_CHECKS: Record<MacroPreset, (n: NutritionFacts) => boolean> = {
  "high-protein": (n) => n.proteinG >= 10,
  "low-sodium": (n) => n.sodiumMg <= 140,
  "under-300-cal": (n) => n.calories <= 300,
  "low-fat": (n) => n.totalFatG <= 3,
  // n.calories > 0 guards the division -- without it, any positive fiber on a 0-calorie item
  // (black coffee, water) divides out to Infinity, which clears every density cutoff and would
  // falsely qualify.
  "high-fiber": (n) => n.calories > 0 && n.dietaryFiberG >= MIN_FIBER_G && (n.dietaryFiberG / n.calories) * 100 >= FIBER_DENSITY_PER_100_KCAL,
};

export function menuItemMacroBadges(item: MenuItem, prefs: FoodPreferences): MacroPreset[] {
  // A stored preset can be stale -- e.g. "under-500-cal", renamed to "under-300-cal" -- if it was
  // toggled on before a rename and never migrated; MACRO_PRESET_CHECKS has no entry for it.
  const qualifying = (prefs.macroPresets ?? []).filter((preset) => MACRO_PRESET_CHECKS[preset]?.(item.nutrition) ?? false);
  // Protein takes priority over fiber (owner decision): whole-grain-crust dishes (pizza) routinely
  // clear both thresholds on fiber-from-crust, not fiber-density -- showing both reads as
  // contradictory. Only suppressed when high-protein is itself enabled AND qualifying; a user who
  // hasn't enabled high-protein still sees high-fiber alone on the same dish.
  if (qualifying.includes("high-protein") && qualifying.includes("high-fiber")) {
    return qualifying.filter((preset) => preset !== "high-fiber");
  }
  return qualifying;
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
