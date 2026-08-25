import type { DiningHallHours, NutritionFacts, RetailLocationHours, TimeWindow } from "@udine/shared";
import {
  directionsUrl,
  formatDateStepperLabel,
  formatServingSummary,
  hallInfoEventsEmptyCopy,
  hallInfoGrabNGoWindow,
  hallInfoHoursRows,
  hallInfoWindowText,
  mealTabLabel,
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
