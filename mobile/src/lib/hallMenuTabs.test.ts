import type { DiningHallHours, NutritionFacts, RetailLocationHours, TimeWindow } from "@udine/shared";
import {
  cafeMealTabLabel,
  directionsUrl,
  formatDateStepperLabel,
  formatServingSummary,
  hallInfoEventsEmptyCopy,
  hallInfoGrabNGoWindow,
  hallInfoHoursRows,
  hallInfoWindowText,
  isCurrentTabLoading,
  mealTabLabel,
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

// Wed 2026-08-19, noon local time.
const NOON = new Date(2026, 7, 19, 12, 0, 0, 0);

describe("mealTabLabel", () => {
  it("labels breakfast/lunch/dinner verbatim, capitalized, and latenight as 'Late'", () => {
    expect(mealTabLabel("breakfast")).toBe("Breakfast");
    expect(mealTabLabel("lunch")).toBe("Lunch");
    expect(mealTabLabel("dinner")).toBe("Dinner");
    expect(mealTabLabel("latenight")).toBe("Late");
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

  it("flags no row as isNow when the hall only has general hours -- currentMealPeriod can match via shared's standard-schedule fallback, but this sheet only shows real published windows", () => {
    const hours = hall({ general: window("7:00 AM", "9:00 PM") });
    const rows = hallInfoHoursRows(hours, NOON);
    expect(rows.every((r) => r.isNow === false)).toBe(true);
    expect(rows.find((r) => r.period === "lunch")?.window).toBeNull();
  });

  it("carries each period's window through unchanged, including null for an unpublished one", () => {
    const hours = hall({ lunch: window("11:00 AM", "2:30 PM") });
    const rows = hallInfoHoursRows(hours, NOON);
    expect(rows.find((r) => r.period === "lunch")?.window).toEqual({ openTime: "11:00 AM", closeTime: "2:30 PM" });
    expect(rows.find((r) => r.period === "dinner")?.window).toBeNull();
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

describe("toggleExpandedKey", () => {
  it("adds a key that isn't expanded yet", () => {
    const next = toggleExpandedKey(new Set(), "menu:1:Pizza");
    expect(next.has("menu:1:Pizza")).toBe(true);
  });

  it("removes a key that's already expanded", () => {
    const next = toggleExpandedKey(new Set(["menu:1:Pizza"]), "menu:1:Pizza");
    expect(next.has("menu:1:Pizza")).toBe(false);
  });

  it("does not mutate the set passed in", () => {
    const original = new Set(["menu:1:Pizza"]);
    toggleExpandedKey(original, "menu:1:Salad");
    expect(original.has("menu:1:Salad")).toBe(false);
    expect(original.size).toBe(1);
  });
});
