import type { CustomFood, MenuItem, NutritionFacts, OffSearchResult, UsdaSearchResult } from "@udine/shared";
import {
  addOrIncrement,
  compositeCalorieRange,
  customFoodToPlateEntry,
  foldRecipeToPlateEntry,
  historyDishToPlateEntry,
  isEstimatedServing,
  listBottomPadding,
  menuItemToPlateEntry,
  offResultToPlateEntry,
  plateKeyFor,
  plateSearchResultDetail,
  plateSearchResultToPlateEntry,
  resolvePlateAndCustomFoodVisibility,
  setCount,
  stepCount,
  sumComposedNutrition,
  toLogEntries,
  totalItemCount,
  totalPlatePrice,
  usdaResultToPlateEntry,
  type PlateEntry,
  type PlateSearchResult,
} from "./plate";
import type { HistoryDish } from "./dishHistory";

function nutrition(calories: number, proteinG = 1): NutritionFacts {
  return {
    servingSize: "1 each",
    calories,
    caloriesFromFat: 0,
    totalFatG: 1,
    satFatG: 0,
    transFatG: 0,
    cholesterolMg: 0,
    sodiumMg: 0,
    totalCarbG: 1,
    dietaryFiberG: 0,
    sugarsG: 0,
    proteinG,
  };
}

function menuItem(dishName: string, hallTid: number, calories = 100, price?: string): MenuItem {
  return {
    dishName,
    category: "Entrees",
    mealPeriod: "lunch",
    hallTid,
    date: "2026-08-19",
    nutrition: nutrition(calories),
    allergens: [],
    dietTags: [],
    ...(price !== undefined ? { price } : {}),
  };
}

describe("plateKeyFor", () => {
  it("keys umass-menu sources by hall + dish name", () => {
    expect(plateKeyFor({ type: "umass-menu", dishName: "Pizza", hallTid: 1 })).toBe(plateKeyFor({ type: "umass-menu", dishName: "Pizza", hallTid: 1 }));
    expect(plateKeyFor({ type: "umass-menu", dishName: "Pizza", hallTid: 1 })).not.toBe(plateKeyFor({ type: "umass-menu", dishName: "Pizza", hallTid: 2 }));
  });

  it("keys off sources by barcode", () => {
    expect(plateKeyFor({ type: "off", barcode: "123", productName: "X" })).toBe(plateKeyFor({ type: "off", barcode: "123", productName: "Y" }));
    expect(plateKeyFor({ type: "off", barcode: "123", productName: "X" })).not.toBe(plateKeyFor({ type: "off", barcode: "456", productName: "X" }));
  });
});

describe("addOrIncrement", () => {
  it("adds a new entry with its own count to an empty plate", () => {
    const entry = menuItemToPlateEntry(menuItem("Pizza", 1));
    const plate = addOrIncrement([], entry);
    expect(plate).toEqual([entry]);
  });

  it("increments the existing entry's count instead of duplicating the row", () => {
    const entry = menuItemToPlateEntry(menuItem("Pizza", 1));
    const plate = addOrIncrement(addOrIncrement([], entry), entry);
    expect(plate).toHaveLength(1);
    expect(plate[0].count).toBe(2);
  });

  it("keeps two different dishes as separate rows", () => {
    const pizza = menuItemToPlateEntry(menuItem("Pizza", 1));
    const salad = menuItemToPlateEntry(menuItem("Salad", 1));
    const plate = addOrIncrement(addOrIncrement([], pizza), salad);
    expect(plate).toHaveLength(2);
  });
});

describe("menuItemToPlateEntry", () => {
  it("carries a café item's price through onto the plate entry", () => {
    const entry = menuItemToPlateEntry(menuItem("Coffee", 32, 5, "$3.00"));
    expect(entry.price).toBe("$3.00");
  });

  it("leaves price undefined for a hall dish with no price in the data", () => {
    const entry = menuItemToPlateEntry(menuItem("Pizza", 1));
    expect(entry.price).toBeUndefined();
  });
});

describe("totalPlatePrice", () => {
  it("sums price * count across priced rows, per the styling spec's '$11.25' example", () => {
    const coffee = menuItemToPlateEntry(menuItem("Coffee", 32, 5, "$3.00"), 2);
    const bagel = menuItemToPlateEntry(menuItem("Bagel", 32, 5, "$5.25"), 1);
    expect(totalPlatePrice([coffee, bagel])).toBe("$11.25");
  });

  it("returns null when nothing on the plate has a price — hall-only plate renders exactly as today", () => {
    const pizza = menuItemToPlateEntry(menuItem("Pizza", 1));
    expect(totalPlatePrice([pizza])).toBeNull();
  });

  it("sums only the priced rows in a mixed hall+café plate, not treating unpriced rows as $0 total", () => {
    const pizza = menuItemToPlateEntry(menuItem("Pizza", 1)); // no price
    const coffee = menuItemToPlateEntry(menuItem("Coffee", 32, 5, "$3.00"));
    expect(totalPlatePrice([pizza, coffee])).toBe("$3.00");
  });
});

describe("setCount", () => {
  it("sets a row's count directly", () => {
    const entry = menuItemToPlateEntry(menuItem("Pizza", 1));
    const plate = setCount([entry], entry.key, 5);
    expect(plate[0].count).toBe(5);
  });

  it("removes the row when count drops to zero", () => {
    const entry = menuItemToPlateEntry(menuItem("Pizza", 1));
    const plate = setCount([entry], entry.key, 0);
    expect(plate).toEqual([]);
  });

  it("removes the row when count goes negative", () => {
    const entry = menuItemToPlateEntry(menuItem("Pizza", 1));
    const plate = setCount([entry], entry.key, -1);
    expect(plate).toEqual([]);
  });

  it("is a no-op for a key not on the plate", () => {
    const entry = menuItemToPlateEntry(menuItem("Pizza", 1));
    const plate = setCount([entry], "nope", 3);
    expect(plate).toEqual([entry]);
  });
});

describe("stepCount", () => {
  it("increments by delta", () => {
    const entry = menuItemToPlateEntry(menuItem("Pizza", 1));
    const plate = stepCount([entry], entry.key, 1);
    expect(plate[0].count).toBe(2);
  });

  it("decrementing to zero removes the row (stepper minus at count 1)", () => {
    const entry = menuItemToPlateEntry(menuItem("Pizza", 1));
    const plate = stepCount([entry], entry.key, -1);
    expect(plate).toEqual([]);
  });
});

describe("totalItemCount", () => {
  it("sums counts across rows, not distinct rows", () => {
    const pizza = { ...menuItemToPlateEntry(menuItem("Pizza", 1)), count: 3 };
    const salad = { ...menuItemToPlateEntry(menuItem("Salad", 1)), count: 2 };
    expect(totalItemCount([pizza, salad])).toBe(5);
  });

  it("is zero for an empty plate", () => {
    expect(totalItemCount([])).toBe(0);
  });
});

describe("toLogEntries", () => {
  it("writes one LogEntry per plate row, with servings = that row's count, not one row per unit", () => {
    const pizza = { ...menuItemToPlateEntry(menuItem("Pizza", 1, 200)), count: 3 };
    const salad = { ...menuItemToPlateEntry(menuItem("Salad", 1, 50)), count: 1 };
    const entries = toLogEntries([pizza, salad], "2026-08-19T12:00:00.000Z");

    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.loggedAt === "2026-08-19T12:00:00.000Z")).toBe(true);

    const pizzaEntry = entries.find((e) => e.source.type === "umass-menu" && e.source.dishName === "Pizza");
    expect(pizzaEntry?.servings).toBe(3);
    expect(pizzaEntry?.nutrition.calories).toBe(200);

    // ids must be unique even when generated in the same tick
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });

  it("carries the off source through for a product added via search", () => {
    const off: PlateEntry = offResultToPlateEntry({
      barcode: "123",
      productName: "Trail Mix",
      nutrition: nutrition(150),
    });
    const entries = toLogEntries([off], "2026-08-19T12:00:00.000Z");
    expect(entries[0].source).toEqual({ type: "off", barcode: "123", productName: "Trail Mix" });
  });
});

describe("listBottomPadding", () => {
  // The plate bar floats over the dish list (occlusion-bug class, PR #78/#84) and is now always
  // mounted (an empty plate still needs a tappable entry point into OFF search) -- the list always
  // needs bottom padding equal to the bar's measured height.
  it("returns the measured bar height", () => {
    expect(listBottomPadding(96)).toBe(96);
  });

  it("returns 0 when the bar hasn't been measured yet", () => {
    expect(listBottomPadding(0)).toBe(0);
  });

  // The filter FAB (`[slug].tsx`'s `styles.filterFab`: right:20/bottom:108/height:48) floats
  // independently above the bar and isn't cleared by the bar's own height alone -- when a caller
  // opts in via `clearFilterFab`, the padding must be at least tall enough to clear the FAB's own
  // bottom+height band (108 + 48 = 156), not just the bar.
  it("clears the filter FAB's own footprint when a short bar wouldn't", () => {
    expect(listBottomPadding(96, true)).toBe(156);
  });

  it("keeps the bar's height when it already clears the filter FAB", () => {
    expect(listBottomPadding(200, true)).toBe(200);
  });
});

describe("offResultToPlateEntry", () => {
  it("maps an OFF search result into a plate entry with count 1", () => {
    const result: OffSearchResult = { barcode: "999", productName: "Chips", nutrition: nutrition(160) };
    const entry = offResultToPlateEntry(result);
    expect(entry.count).toBe(1);
    expect(entry.label).toBe("Chips");
    expect(entry.key).toBe(plateKeyFor({ type: "off", barcode: "999", productName: "Chips" }));
  });
});

describe("historyDishToPlateEntry", () => {
  // #339-followup finding: LogEntry.nutrition is a per-serving snapshot -- toLogEntries stores
  // p.nutrition unchanged and computeDailyTotals is the thing that multiplies by servings (see
  // shared/src/macros.ts). A history-dish conversion must carry that per-serving value straight
  // through, NOT divide it by (or multiply it by) however many servings were logged historically --
  // doing so would silently double or halve macros on re-add with nothing else catching it.
  it("carries the historical nutrition value through unchanged and resets count to 1, regardless of how many servings were originally logged", () => {
    const dish: HistoryDish = { dishName: "Pizza", hallTid: 1, nutrition: nutrition(200) };
    const entry = historyDishToPlateEntry(dish);
    expect(entry.nutrition.calories).toBe(200); // unchanged -- not 600 (x3) or 66.67 (/3)
    expect(entry.count).toBe(1); // reset default, never carries over the original historical servings
  });

  it("keys, labels, and sources a history dish the same way a fresh menu dish from that hall would", () => {
    const dish: HistoryDish = { dishName: "Pizza", hallTid: 1, nutrition: nutrition(200) };
    const entry = historyDishToPlateEntry(dish);
    expect(entry.key).toBe(plateKeyFor({ type: "umass-menu", dishName: "Pizza", hallTid: 1 }));
    expect(entry.label).toBe("Pizza");
    expect(entry.source).toEqual({ type: "umass-menu", dishName: "Pizza", hallTid: 1 });
  });
});

const USDA_RESULT: UsdaSearchResult = { fdcId: "173944", productName: "Banana, raw", nutrition: nutrition(89) };
const CUSTOM_FOOD: CustomFood = { id: "c1", name: "Grandma's Lasagna", servingSize: "1 slice", nutrition: nutrition(420) };

describe("usdaResultToPlateEntry", () => {
  it("keys by fdcId and defaults count to 1", () => {
    const entry = usdaResultToPlateEntry(USDA_RESULT);
    expect(entry.key).toBe(plateKeyFor({ type: "usda", fdcId: "173944", productName: "Banana, raw" }));
    expect(entry.label).toBe("Banana, raw");
    expect(entry.nutrition.calories).toBe(89);
    expect(entry.count).toBe(1);
    expect(entry.source).toEqual({ type: "usda", fdcId: "173944", productName: "Banana, raw" });
  });
});

describe("customFoodToPlateEntry", () => {
  it("keys by the custom food's own id and defaults count to 1", () => {
    const entry = customFoodToPlateEntry(CUSTOM_FOOD);
    expect(entry.key).toBe(plateKeyFor({ type: "custom", customFoodId: "c1", productName: "Grandma's Lasagna" }));
    expect(entry.label).toBe("Grandma's Lasagna");
    expect(entry.nutrition.calories).toBe(420);
    expect(entry.count).toBe(1);
    expect(entry.source).toEqual({ type: "custom", customFoodId: "c1", productName: "Grandma's Lasagna" });
  });
});

describe("plateKeyFor (usda/custom)", () => {
  it("keys usda sources by fdcId, not productName", () => {
    expect(plateKeyFor({ type: "usda", fdcId: "1", productName: "X" })).toBe(plateKeyFor({ type: "usda", fdcId: "1", productName: "Y" }));
    expect(plateKeyFor({ type: "usda", fdcId: "1", productName: "X" })).not.toBe(plateKeyFor({ type: "usda", fdcId: "2", productName: "X" }));
  });

  it("keys custom sources by customFoodId, not productName", () => {
    expect(plateKeyFor({ type: "custom", customFoodId: "c1", productName: "X" })).toBe(plateKeyFor({ type: "custom", customFoodId: "c1", productName: "Y" }));
    expect(plateKeyFor({ type: "custom", customFoodId: "c1", productName: "X" })).not.toBe(plateKeyFor({ type: "custom", customFoodId: "c2", productName: "X" }));
  });
});

describe("plateSearchResultToPlateEntry", () => {
  const OFF_PRODUCT: OffSearchResult = { barcode: "123", productName: "Cheerios", nutrition: nutrition(110) };
  const HISTORY_DISH: HistoryDish = { dishName: "Pizza", hallTid: 1, nutrition: nutrition(200) };

  it.each<[string, PlateSearchResult, string]>([
    ["umass", { kind: "umass", dish: HISTORY_DISH }, "Pizza"],
    ["off", { kind: "off", product: OFF_PRODUCT }, "Cheerios"],
    ["usda", { kind: "usda", food: USDA_RESULT }, "Banana, raw"],
    ["custom", { kind: "custom", food: CUSTOM_FOOD }, "Grandma's Lasagna"],
  ])("dispatches a %s result to the matching *ToPlateEntry conversion", (_kind, result, expectedLabel) => {
    expect(plateSearchResultToPlateEntry(result).label).toBe(expectedLabel);
  });

  it("passes count through to the underlying conversion", () => {
    expect(plateSearchResultToPlateEntry({ kind: "off", product: OFF_PRODUCT }, 3).count).toBe(3);
  });
});

describe("plateSearchResultDetail", () => {
  it("umass hits carry empty allergens/dietTags -- HistoryDish has no such data", () => {
    const detail = plateSearchResultDetail({ kind: "umass", dish: { dishName: "Pizza", hallTid: 1, nutrition: nutrition(200) } });
    expect(detail).toEqual({ dishName: "Pizza", subtitle: "via UMass Dining", badge: "UMASS", nutrition: nutrition(200), allergens: [], dietTags: [] });
  });

  it("off hits surface allergens/ingredients when OFF provided them, omit ingredients otherwise", () => {
    const withBoth = plateSearchResultDetail({
      kind: "off",
      product: { barcode: "1", productName: "Trail Mix", nutrition: nutrition(500), allergens: ["Milk", "Tree Nuts"], ingredients: "Peanuts, raisins" },
    });
    expect(withBoth.allergens).toEqual(["Milk", "Tree Nuts"]);
    expect(withBoth.ingredients).toBe("Peanuts, raisins");
    expect(withBoth.badge).toBe("PACKAGED");
    expect(withBoth.subtitle).toBe("via OpenFoodFacts");

    const withNeither = plateSearchResultDetail({ kind: "off", product: { barcode: "2", productName: "Plain", nutrition: nutrition(100) } });
    expect(withNeither.allergens).toEqual([]);
    expect("ingredients" in withNeither).toBe(false);
  });

  it("usda hits use FDC's own subtitle and surface ingredients when present", () => {
    const detail = plateSearchResultDetail({ kind: "usda", food: { ...USDA_RESULT, ingredients: "100% banana" } });
    expect(detail.subtitle).toBe("via USDA FoodData Central");
    expect(detail.badge).toBe("USDA");
    expect(detail.ingredients).toBe("100% banana");
  });

  it("custom hits use the food's own name and ingredients", () => {
    const detail = plateSearchResultDetail({ kind: "custom", food: { ...CUSTOM_FOOD, ingredients: "Pasta, sauce, cheese" } });
    expect(detail.dishName).toBe("Grandma's Lasagna");
    expect(detail.subtitle).toBe("via custom entry");
    expect(detail.badge).toBe("CUSTOM");
    expect(detail.ingredients).toBe("Pasta, sauce, cheese");
  });
});

describe("isEstimatedServing", () => {
  // searchProducts (shared/src/openFoodFacts.ts) falls back to per-100g nutriments when a hit has
  // no per-serving data, and marks that by setting nutrition.servingSize to the literal "per 100g"
  // -- this is the flip side of that marker actually reaching the UI, not just existing in shared.
  it("flags OFF results that fell back to per-100g nutriments", () => {
    expect(isEstimatedServing({ ...nutrition(160), servingSize: "per 100g" })).toBe(true);
  });

  it("does not flag a real per-serving nutrition snapshot", () => {
    expect(isEstimatedServing({ ...nutrition(160), servingSize: "28 g" })).toBe(false);
  });

  it("does not flag a umass-menu item (servingSize is never the literal marker string)", () => {
    expect(isEstimatedServing({ ...nutrition(160), servingSize: "1 each" })).toBe(false);
  });
});

describe("resolvePlateAndCustomFoodVisibility", () => {
  // #436: PlateSheet's own "Can't find it? Create a custom food" row flips customFoodFormOpen
  // while sheetOpen is still true -- both Modals must never be visible=true at once on Android
  // (silently fails to present the second one). CustomFoodForm must win, forcing PlateSheet closed.
  it("closes PlateSheet the instant CustomFoodForm should open, even though sheetOpen never changes", () => {
    expect(resolvePlateAndCustomFoodVisibility(true, true)).toEqual({ plateSheetVisible: false, customFoodFormVisible: true });
  });

  // Once CustomFoodForm is dismissed, PlateSheet reopens on its own -- sheetOpen was never
  // touched, so no separate "remember to reopen" state is needed.
  it("reopens PlateSheet on its own once customFoodFormOpen goes back to false", () => {
    expect(resolvePlateAndCustomFoodVisibility(true, false)).toEqual({ plateSheetVisible: true, customFoodFormVisible: false });
  });

  // CafeSheet's identical trigger (sheetOpen never becomes true there) must keep working exactly
  // as before -- CustomFoodForm alone, no PlateSheet in the picture.
  it("leaves CustomFoodForm alone when PlateSheet was never open (CafeSheet's flow)", () => {
    expect(resolvePlateAndCustomFoodVisibility(false, true)).toEqual({ plateSheetVisible: false, customFoodFormVisible: true });
  });

  it("both closed is both closed", () => {
    expect(resolvePlateAndCustomFoodVisibility(false, false)).toEqual({ plateSheetVisible: false, customFoodFormVisible: false });
  });
});

// Composite dish (bowl composer) -- foodpro-menu-expansion brief, task 2.
const TERIYAKI_BOWL = menuItem("Teriyaki Noodle Bowl", 1, 260 /* cal */);
const EDAMAME = menuItem("Edamame", 1, 45);
const CARROT = menuItem("Shredded Carrot", 1, 15);
const SHALLOTS = menuItem("Fried Shallots", 1, 70);
const SRIRACHA = menuItem("Sriracha Mayo", 1, 50);
// menuItem()'s nutrition() default gives every dish 1g protein -- override where a test cares
// about protein specifically (compositeCalorieRange's own 10-15g range assertion).
const TERIYAKI_BOWL_P = { ...TERIYAKI_BOWL, nutrition: nutrition(260, 10) };
const EDAMAME_P = { ...EDAMAME, nutrition: nutrition(45, 4) };
const CARROT_P = { ...CARROT, nutrition: nutrition(15, 0) };
const SHALLOTS_P = { ...SHALLOTS, nutrition: nutrition(70, 1) };
const SRIRACHA_P = { ...SRIRACHA, nutrition: nutrition(50, 0) };

describe("sumComposedNutrition", () => {
  it("sums base + every add-in at its own selected count, not just its own 1 unit", () => {
    const result = sumComposedNutrition(TERIYAKI_BOWL.nutrition, [
      { item: EDAMAME, count: 1 },
      { item: CARROT, count: 2 },
    ]);
    expect(result.calories).toBe(260 + 45 + 15 * 2);
  });

  it("recomputes from whatever's selected right now -- zero add-ins is just the base", () => {
    expect(sumComposedNutrition(TERIYAKI_BOWL.nutrition, []).calories).toBe(260);
  });

  it("drops the source's %DV fields -- a composed dish has no single %DV to report", () => {
    const withDv = { ...TERIYAKI_BOWL.nutrition, totalFatDv: 12 };
    expect(sumComposedNutrition(withDv, []).totalFatDv).toBeUndefined();
  });
});

describe("compositeCalorieRange", () => {
  it("is base-alone at the low end and base + one of every add-in at the high end, recomputed from the live add-in list", () => {
    const range = compositeCalorieRange(TERIYAKI_BOWL_P, [EDAMAME_P, CARROT_P, SHALLOTS_P, SRIRACHA_P]);
    expect(range).toEqual({ minCalories: 260, maxCalories: 440, minProteinG: 10, maxProteinG: 15 });
  });

  it("shrinks the range when a dropped add-in leaves the catalog list -- not a value cached at fixture time", () => {
    const range = compositeCalorieRange(TERIYAKI_BOWL_P, [EDAMAME_P]);
    expect(range).toEqual({ minCalories: 260, maxCalories: 305, minProteinG: 10, maxProteinG: 14 });
  });
});

describe("foldRecipeToPlateEntry", () => {
  it("keys the folded entry by the BASE dish, not a synthetic composite id", () => {
    const entry = foldRecipeToPlateEntry(TERIYAKI_BOWL, { addIns: [{ item: EDAMAME, count: 1 }] });
    expect(entry.key).toBe(plateKeyFor({ type: "umass-menu", dishName: "Teriyaki Noodle Bowl", hallTid: 1 }));
  });

  it("sums base + every selected add-in into one per-unit nutrition snapshot", () => {
    const entry = foldRecipeToPlateEntry(TERIYAKI_BOWL, {
      addIns: [
        { item: EDAMAME, count: 1 },
        { item: CARROT, count: 1 },
      ],
    });
    expect(entry.nutrition.calories).toBe(260 + 45 + 15);
  });

  it("defaults count to 1 whole recipe, but takes an explicit count for the in-plate stepper", () => {
    expect(foldRecipeToPlateEntry(TERIYAKI_BOWL, { addIns: [] }).count).toBe(1);
    expect(foldRecipeToPlateEntry(TERIYAKI_BOWL, { addIns: [] }, 3).count).toBe(3);
  });
});
