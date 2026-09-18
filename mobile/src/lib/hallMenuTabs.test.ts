import type { DiningHallHours, MenuItem, NutritionFacts, RetailLocationHours, TimeWindow } from "@udine/shared";
import {
  cafeMealTabLabel,
  deriveHallMealTabs,
  directionsUrl,
  formatDateStepperLabel,
  formatServingSummary,
  hallInfoEventsEmptyCopy,
  hallInfoGrabNGoWindow,
  hallInfoHoursRows,
  hallInfoWindowText,
  isBrunchLunch,
  isCurrentTabLoading,
  mealTabLabel,
  plateSheetContextLabel,
  shouldAutoCorrectMealTab,
  stepDate,
  toggleExpandedKey,
} from "./hallMenuTabs";

function window(openTime: string, closeTime: string): TimeWindow {
  return { openTime, closeTime };
}

function hall(overrides: Partial<DiningHallHours> = {}): DiningHallHours {
  return { hallTid: 1, breakfast: null, lunch: null, dinner: null, latenight: null, general: null, ...overrides };
}

// Real category name strings from live foodpro-menu-ajax captures (see the ticket's ground truth),
// not placeholders: weekday Franklin lunch/dinner categories don't start with "Breakfast", but
// Saturday's sole midday "lunch" period folds "Breakfast Entrees"/"Breakfast Pastries" in alongside
// ordinary lunch categories.
function menuItem(mealPeriod: MenuItem["mealPeriod"], category: string, hallTid = 2): MenuItem {
  return {
    dishName: "Item",
    category,
    mealPeriod,
    hallTid,
    date: "2026-09-12",
    nutrition: {
      servingSize: "1 serving",
      calories: 100,
      caloriesFromFat: 0,
      totalFatG: 0,
      satFatG: 0,
      transFatG: 0,
      cholesterolMg: 0,
      sodiumMg: 0,
      totalCarbG: 0,
      dietaryFiberG: 0,
      sugarsG: 0,
      proteinG: 0,
    },
    allergens: [],
    dietTags: [],
  };
}

// Wed 2026-08-19, noon local time.
const NOON = new Date(2026, 7, 19, 12, 0, 0, 0);

describe("mealTabLabel", () => {
  it("labels breakfast/lunch/dinner verbatim, capitalized, and latenight as 'Late'", () => {
    expect(mealTabLabel("breakfast")).toBe("Breakfast");
    expect(mealTabLabel("lunch")).toBe("Lunch");
    expect(mealTabLabel("dinner")).toBe("Dinner");
    expect(mealTabLabel("latenight")).toBe("Late");
  });

  it("reads 'Brunch' for lunch when isBrunch is true, leaving every other period unaffected", () => {
    expect(mealTabLabel("lunch", true)).toBe("Brunch");
    expect(mealTabLabel("dinner", true)).toBe("Dinner");
    expect(mealTabLabel("latenight", true)).toBe("Late");
  });

  it("defaults isBrunch to false", () => {
    expect(mealTabLabel("lunch")).toBe("Lunch");
  });
});

describe("cafeMealTabLabel", () => {
  // #378: CafeMenuIntegrated.dc.html:30 spec's "Daily Offerings", not shared's generic "All Day"
  // (confirmed by shared/src/umassDining.test.ts:233) -- café context only, a real hall's own
  // "allday" period (if it ever had one) must still read "All Day".
  it("reads 'Daily Offerings' for a café's allday tab", () => {
    expect(cafeMealTabLabel("allday", false)).toBe("Daily Offerings");
  });

  it("leaves a real hall's allday tab as 'All Day'", () => {
    expect(cafeMealTabLabel("allday", true)).toBe("All Day");
  });

  it("leaves every other period unchanged for a café", () => {
    expect(cafeMealTabLabel("lunch", false)).toBe("Lunch");
    expect(cafeMealTabLabel("latenight", false)).toBe("Late");
  });

  it("passes isBrunch through to mealTabLabel for a real hall", () => {
    expect(cafeMealTabLabel("lunch", true, true)).toBe("Brunch");
    expect(cafeMealTabLabel("lunch", true, false)).toBe("Lunch");
  });
});

// platesheet-search-results-parity-gap task 1: PlateSheetResults.dc.html:32 spec's
// "<Hall> · <Meal>" for PlateSheet's contextLabel -- halls/[slug].tsx used to pass hall.name
// alone, dropping the meal period entirely. Echoes exactly what the active tab reads
// (cafeMealTabLabel), not a second hand-rolled label.
describe("plateSheetContextLabel", () => {
  it("joins the hall name and the active meal period's label", () => {
    expect(plateSheetContextLabel("Franklin", "lunch", true, false)).toBe("Franklin · Lunch");
    expect(plateSheetContextLabel("Franklin", "breakfast", true, false)).toBe("Franklin · Breakfast");
  });

  it("reads 'Grab 'N Go' for the Grab tab, which isn't a MealPeriod", () => {
    expect(plateSheetContextLabel("Worcester", "grab", true, false)).toBe("Worcester · Grab 'N Go");
  });

  it("passes isBrunch/isRealHall through to cafeMealTabLabel", () => {
    expect(plateSheetContextLabel("Hampshire", "lunch", true, true)).toBe("Hampshire · Brunch");
    expect(plateSheetContextLabel("Bluewall", "allday", false, false)).toBe("Bluewall · Daily Offerings");
  });
});

describe("deriveHallMealTabs", () => {
  // Ground truth: Berkshire (tid=4) has no breakfast key at all, any day; Franklin (tid=2) almost
  // never has a "late night" key. A period with zero items is absent from that day's `items`
  // entirely, not present-with-empty-content.
  it("omits a period the day's items don't include at all, keeping canonical order for the rest", () => {
    const items = [
      menuItem("grabngo", "Grab", 4),
      menuItem("lunch", "Deli", 4),
      menuItem("dinner", "Grill", 4),
      menuItem("latenight", "Late Bites", 4),
    ];
    expect(deriveHallMealTabs(items)).toEqual(["lunch", "dinner", "latenight"]);
  });

  it("includes every period that has at least one item that day", () => {
    const items = [menuItem("breakfast", "Eggs"), menuItem("lunch", "Deli"), menuItem("dinner", "Grill"), menuItem("latenight", "Late Bites")];
    expect(deriveHallMealTabs(items)).toEqual(["breakfast", "lunch", "dinner", "latenight"]);
  });

  it("returns an empty list for a day with no items at all", () => {
    expect(deriveHallMealTabs([])).toEqual([]);
  });

  it("preserves breakfast->lunch->dinner->latenight order regardless of feed encounter order", () => {
    const items = [menuItem("dinner", "Grill"), menuItem("breakfast", "Eggs")];
    expect(deriveHallMealTabs(items)).toEqual(["breakfast", "dinner"]);
  });
});

describe("isBrunchLunch", () => {
  // Saturday Franklin/Hampshire: sole midday period is "lunch", its categories include
  // "Breakfast Entrees"/"Breakfast Pastries" folded in alongside ordinary lunch categories.
  it("is true when lunch items include a 'Breakfast...' category and there's no separate breakfast tab", () => {
    const items = [menuItem("lunch", "Breakfast Entrees"), menuItem("lunch", "Deli"), menuItem("dinner", "Grill")];
    const mealTabs = deriveHallMealTabs(items);
    expect(mealTabs).toEqual(["lunch", "dinner"]);
    expect(isBrunchLunch(items, mealTabs)).toBe(true);
  });

  it("is false when a separate breakfast tab exists that day, even if lunch also has a Breakfast-prefixed category", () => {
    const items = [menuItem("breakfast", "Breakfast Entrees"), menuItem("lunch", "Breakfast Entrees"), menuItem("lunch", "Deli")];
    const mealTabs = deriveHallMealTabs(items);
    expect(mealTabs).toContain("breakfast");
    expect(isBrunchLunch(items, mealTabs)).toBe(false);
  });

  // Berkshire ground truth: lunch NEVER includes a "Breakfast..." category, weekday or Saturday --
  // it just doesn't serve breakfast food, that's not brunch. A day-of-week guess would mislabel it.
  it("is false for an ordinary lunch with no Breakfast-prefixed category, even with no breakfast tab (Berkshire)", () => {
    const items = [menuItem("lunch", "Deli", 4), menuItem("lunch", "Grill", 4), menuItem("dinner", "Grill", 4)];
    const mealTabs = deriveHallMealTabs(items);
    expect(mealTabs).not.toContain("breakfast");
    expect(isBrunchLunch(items, mealTabs)).toBe(false);
  });

  it("is false when there's no lunch period at all", () => {
    expect(isBrunchLunch([menuItem("dinner", "Grill")], ["dinner"])).toBe(false);
  });
});

describe("shouldAutoCorrectMealTab", () => {
  const REAL_HALL_TABS: readonly ("breakfast" | "lunch" | "dinner" | "latenight")[] = ["breakfast", "lunch", "dinner", "latenight"];

  // The bug this guards against (PR review finding): opening a hall during its actual current meal
  // period (the static "lunch" default already matches) previously still armed [slug].tsx's
  // one-shot mealTabInstantRef flag, because the guard only checked tab membership. setSelectedMeal
  // with the value it already holds is a same-value no-op React bails on -- activeIndex never
  // changes, MealTabPager's consuming effect never re-fires, and the armed flag leaked onto the
  // user's NEXT real swipe/tap, wrongly snapping it instead of tweening it.
  it("returns false when the resolved period already matches the currently-selected tab (the no-op case that used to leak the instant flag)", () => {
    expect(shouldAutoCorrectMealTab("lunch", "lunch", REAL_HALL_TABS)).toBe(false);
  });

  it("returns true when the resolved period differs from the currently-selected tab and is a real tab", () => {
    expect(shouldAutoCorrectMealTab("dinner", "lunch", REAL_HALL_TABS)).toBe(true);
    expect(shouldAutoCorrectMealTab("breakfast", "lunch", REAL_HALL_TABS)).toBe(true);
  });

  it("returns false for a period the hall has no tab for (e.g. resolved 'closed', cast through by the caller) even if it differs from selectedMeal", () => {
    expect(shouldAutoCorrectMealTab("closed" as never, "lunch", REAL_HALL_TABS)).toBe(false);
  });

  it("returns true comparing against the 'grab' tab selection, since 'grab' never equals a MealPeriod", () => {
    expect(shouldAutoCorrectMealTab("dinner", "grab", REAL_HALL_TABS)).toBe(true);
  });

  it("returns true comparing against a null selection (not yet chosen)", () => {
    expect(shouldAutoCorrectMealTab("lunch", null, REAL_HALL_TABS)).toBe(true);
  });

  // #442-follow-up: mealTabs is now dynamic per hall/day (deriveHallMealTabs), not always the
  // fixed 4 -- Berkshire has no breakfast tab, ever. currentMealPeriod resolving to "breakfast"
  // there (e.g. hoursFeed's standard-schedule fallback) must never auto-correct into a tab the
  // hall doesn't have, which would leave MealTabPager with no pill highlighted (this guard's own
  // top-level doc explains why).
  it("returns false when the resolved period is hidden from this hall's own (dynamic) mealTabs, even though it's a real MealPeriod", () => {
    const berkshireTabs: readonly ("lunch" | "dinner" | "latenight")[] = ["lunch", "dinner", "latenight"];
    expect(shouldAutoCorrectMealTab("breakfast", "lunch", berkshireTabs)).toBe(false);
  });
});

// Café-screen QA fix (bug 1): the info-only café's plate bar used to read as PERMANENTLY loading --
// no mealTabs means selectedMeal never leaves null, and the original inline formula treated that as
// "still loading" unconditionally.
describe("isCurrentTabLoading", () => {
  it("an info-only café is never 'loading', even though selectedMeal stays null forever", () => {
    expect(isCurrentTabLoading({ selectedMeal: null, isRealHall: false, hasItems: true, hasGrabItems: false, cafeStateKind: "info" })).toBe(false);
  });

  it("a café whose waterfall hasn't resolved yet (cafeStateKind null) IS loading", () => {
    expect(isCurrentTabLoading({ selectedMeal: null, isRealHall: false, hasItems: false, hasGrabItems: false, cafeStateKind: null })).toBe(true);
  });

  it("an integrated/standing café is loading only until selectedMeal picks its first tab", () => {
    expect(isCurrentTabLoading({ selectedMeal: null, isRealHall: false, hasItems: true, hasGrabItems: false, cafeStateKind: "standing" })).toBe(true);
    expect(isCurrentTabLoading({ selectedMeal: "allday", isRealHall: false, hasItems: true, hasGrabItems: false, cafeStateKind: "standing" })).toBe(false);
  });

  it("a real hall is loading while its items haven't arrived, or before the initial tab lands", () => {
    expect(isCurrentTabLoading({ selectedMeal: "lunch", isRealHall: true, hasItems: false, hasGrabItems: false, cafeStateKind: null })).toBe(true);
    expect(isCurrentTabLoading({ selectedMeal: null, isRealHall: true, hasItems: true, hasGrabItems: false, cafeStateKind: null })).toBe(true);
    expect(isCurrentTabLoading({ selectedMeal: "lunch", isRealHall: true, hasItems: true, hasGrabItems: false, cafeStateKind: null })).toBe(false);
  });

  it("the grab tab is loading purely off hasGrabItems, regardless of isRealHall/cafeStateKind", () => {
    expect(isCurrentTabLoading({ selectedMeal: "grab", isRealHall: true, hasItems: true, hasGrabItems: false, cafeStateKind: null })).toBe(true);
    expect(isCurrentTabLoading({ selectedMeal: "grab", isRealHall: true, hasItems: true, hasGrabItems: true, cafeStateKind: null })).toBe(false);
  });
});

describe("stepDate", () => {
  it("moves forward and backward by whole days without drifting across a month boundary", () => {
    const aug31 = new Date(2026, 7, 31, 15, 30, 0);
    const sep1 = stepDate(aug31, 1);
    expect(sep1.getMonth()).toBe(8);
    expect(sep1.getDate()).toBe(1);
    expect(sep1.getHours()).toBe(15); // time-of-day preserved, only the calendar day moves

    const backAgain = stepDate(sep1, -1);
    expect(backAgain.getMonth()).toBe(7);
    expect(backAgain.getDate()).toBe(31);
  });

  it("does not mutate the date passed in", () => {
    const original = new Date(2026, 7, 19);
    const originalTime = original.getTime();
    stepDate(original, 1);
    expect(original.getTime()).toBe(originalTime);
  });
});

describe("formatDateStepperLabel", () => {
  it("formats as 'Wed, Aug 19' per the canvas header", () => {
    expect(formatDateStepperLabel(new Date(2026, 7, 19))).toBe("Wed, Aug 19");
  });
});

// #180: mealTabSubtitle and its 4 tests here were removed -- the tab row's "being served now ·
// until X" line is gone; serving windows now live only in the hall-info sheet. hallInfoHoursRows'
// NOW-highlight tests below are the successor coverage for the "is this the hall's current meal
// period" logic that line used to gate on.

describe("hallInfoHoursRows", () => {
  it("flags exactly the hall's current meal period as isNow, in breakfast/lunch/dinner/latenight order", () => {
    const hours = hall({ lunch: window("11:00 AM", "2:30 PM"), dinner: window("5:00 PM", "8:00 PM") });
    const rows = hallInfoHoursRows(hours, NOON);
    expect(rows.map((r) => r.period)).toEqual(["breakfast", "lunch", "dinner", "latenight"]);
    expect(rows.map((r) => r.isNow)).toEqual([false, true, false, false]);
    expect(rows.find((r) => r.period === "lunch")?.label).toBe("Lunch");
  });

  it("flags no row as isNow when the hall is between meals", () => {
    const hours = hall({ lunch: window("11:00 AM", "2:30 PM"), dinner: window("5:00 PM", "8:00 PM") });
    const threePM = new Date(2026, 7, 19, 15, 0, 0, 0);
    const rows = hallInfoHoursRows(hours, threePM);
    expect(rows.every((r) => !r.isNow)).toBe(true);
  });

  it("#432: collapses to a single general-hours row when breakfast/lunch/dinner are all null but general is published, instead of three 'not served here' rows", () => {
    const hours = hall({ general: window("7:00 AM", "9:00 PM") });
    const rows = hallInfoHoursRows(hours, NOON);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ period: "general", label: "Hours", window: { openTime: "7:00 AM", closeTime: "9:00 PM" }, isNow: false });
  });

  it("keeps the normal 4-row breakfast/lunch/dinner/latenight layout when at least one per-meal window is published, even alongside general", () => {
    const hours = hall({ lunch: window("11:00 AM", "2:30 PM"), general: window("7:00 AM", "9:00 PM") });
    const rows = hallInfoHoursRows(hours, NOON);
    expect(rows.map((r) => r.period)).toEqual(["breakfast", "lunch", "dinner", "latenight"]);
  });

  it("shows three 'not served here' rows (not the general fallback) when everything, including general, is null", () => {
    const hours = hall({});
    const rows = hallInfoHoursRows(hours, NOON);
    expect(rows.map((r) => r.period)).toEqual(["breakfast", "lunch", "dinner", "latenight"]);
    expect(rows.every((r) => r.window === null)).toBe(true);
  });

  it("carries each period's window through unchanged, including null for an unpublished one", () => {
    const hours = hall({ lunch: window("11:00 AM", "2:30 PM") });
    const rows = hallInfoHoursRows(hours, NOON);
    expect(rows.find((r) => r.period === "lunch")?.window).toEqual({ openTime: "11:00 AM", closeTime: "2:30 PM" });
    expect(rows.find((r) => r.period === "dinner")?.window).toBeNull();
  });

  // #442-follow-up: the sheet must hide the same periods the tab row hides (deriveHallMealTabs),
  // not fall back to the fixed MEAL_TABS -- otherwise Berkshire shows a phantom "not served here"
  // breakfast row the tab row has already omitted for the same day.
  it("omits a row for a period absent from the passed-in mealTabs, instead of showing 'not served here'", () => {
    const hours = hall({ lunch: window("11:00 AM", "2:30 PM"), dinner: window("5:00 PM", "8:00 PM"), latenight: window("9:00 PM", "11:00 PM") });
    const berkshireTabs: readonly ("lunch" | "dinner" | "latenight")[] = ["lunch", "dinner", "latenight"];
    const rows = hallInfoHoursRows(hours, NOON, berkshireTabs);
    expect(rows.map((r) => r.period)).toEqual(["lunch", "dinner", "latenight"]);
  });

  it("labels lunch as 'Brunch' when isBrunch is true, leaving other rows unaffected", () => {
    const hours = hall({ lunch: window("10:00 AM", "2:00 PM"), dinner: window("5:00 PM", "8:00 PM") });
    const saturdayTabs: readonly ("lunch" | "dinner")[] = ["lunch", "dinner"];
    const rows = hallInfoHoursRows(hours, NOON, saturdayTabs, true);
    expect(rows.map((r) => r.period)).toEqual(["lunch", "dinner"]);
    expect(rows.find((r) => r.period === "lunch")?.label).toBe("Brunch");
    expect(rows.find((r) => r.period === "dinner")?.label).toBe("Dinner");
  });

  it("defaults mealTabs to the fixed MEAL_TABS and isBrunch to false when omitted", () => {
    const hours = hall({ lunch: window("11:00 AM", "2:30 PM") });
    const rows = hallInfoHoursRows(hours, NOON);
    expect(rows.map((r) => r.period)).toEqual(["breakfast", "lunch", "dinner", "latenight"]);
    expect(rows.find((r) => r.period === "lunch")?.label).toBe("Lunch");
  });
});

describe("hallInfoWindowText", () => {
  it("renders the feed's own H:MM AM/PM strings verbatim for a real window", () => {
    expect(hallInfoWindowText(window("11:00 AM", "2:30 PM"))).toBe("11:00 AM - 2:30 PM");
  });

  it("renders the spec's exact absent-window copy for a null window", () => {
    expect(hallInfoWindowText(null)).toBe("not served here");
  });
});

function retail(overrides: Partial<RetailLocationHours> = {}): RetailLocationHours {
  return { name: "Hampshire Grab ‘N Go", hours: null, ...overrides };
}

describe("hallInfoGrabNGoWindow", () => {
  it("finds this hall's Grab 'N Go window among retail locations, smart-apostrophe spelling included", () => {
    const locations = [retail({ name: "Hampshire Grab ‘N Go", hours: window("11:00 AM", "7:00 PM") }), retail({ name: "Hampshire Café" })];
    expect(hallInfoGrabNGoWindow(locations, "Hampshire")).toEqual({ openTime: "11:00 AM", closeTime: "7:00 PM" });
  });

  it("returns null when this hall has no Grab 'N Go entry in retail at all", () => {
    expect(hallInfoGrabNGoWindow([retail({ name: "Hampshire Café" })], "Hampshire")).toBeNull();
  });
});

describe("directionsUrl", () => {
  it("builds a maps deep link from a validated lat,long", () => {
    expect(directionsUrl("42.383790,-72.530519")).toBe("https://maps.google.com/?q=42.383790%2C-72.530519");
  });

  it("returns null when there's no map address to link to", () => {
    expect(directionsUrl(null)).toBeNull();
    expect(directionsUrl(undefined)).toBeNull();
  });
});

describe("hallInfoEventsEmptyCopy", () => {
  it("formats the exact empty-state copy per the canvas spec", () => {
    expect(hallInfoEventsEmptyCopy("Hampshire")).toBe("No events at Hampshire this week");
  });
});

function nutrition(overrides: Partial<NutritionFacts> = {}): NutritionFacts {
  return {
    servingSize: "6 oz",
    calories: 160,
    caloriesFromFat: 45,
    totalFatG: 5,
    satFatG: 1,
    transFatG: 0,
    cholesterolMg: 0,
    sodiumMg: 0,
    totalCarbG: 0,
    dietaryFiberG: 0,
    sugarsG: 0,
    proteinG: 27,
    ...overrides,
  };
}

describe("formatServingSummary", () => {
  it("formats the expanded-card summary line per the canvas spec", () => {
    expect(formatServingSummary(nutrition())).toBe("Per serving 6 oz · 160 cal · 27g protein · 0g carbs · 5g fat");
  });

  it("rounds fractional macros to whole grams", () => {
    expect(formatServingSummary(nutrition({ proteinG: 27.4, totalCarbG: 3.6, totalFatG: 4.5 }))).toBe(
      "Per serving 6 oz · 160 cal · 27g protein · 4g carbs · 5g fat",
    );
  });
});

describe("toggleExpandedKey (single-expand: at most one card open at a time)", () => {
  it("opens a key when nothing is expanded", () => {
    expect(toggleExpandedKey(null, "menu:1:Pizza")).toBe("menu:1:Pizza");
  });

  it("closes the key that's already expanded", () => {
    expect(toggleExpandedKey("menu:1:Pizza", "menu:1:Pizza")).toBe(null);
  });

  it("switches to a different key, closing whatever was open", () => {
    expect(toggleExpandedKey("menu:1:Pizza", "menu:1:Salad")).toBe("menu:1:Salad");
  });
});
