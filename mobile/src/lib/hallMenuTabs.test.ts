import type { DiningHallHours, NutritionFacts, TimeWindow } from "@udine/shared";
import { formatDateStepperLabel, formatServingSummary, mealTabLabel, mealTabSubtitle, stepDate, toggleExpandedKey } from "./hallMenuTabs";

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

describe("mealTabSubtitle", () => {
  it("returns the being-served-now line when the selected day is today and the selected tab matches the hall's current meal period", () => {
    const hours = hall({ lunch: window("11:00 AM", "2:30 PM") });
    const subtitle = mealTabSubtitle(hours, NOON, "lunch", NOON);
    expect(subtitle).toBe("being served now · until 2:30 PM");
  });

  it("returns null when the selected tab isn't the hall's current meal period", () => {
    const hours = hall({ lunch: window("11:00 AM", "2:30 PM"), dinner: window("5:00 PM", "8:00 PM") });
    expect(mealTabSubtitle(hours, NOON, "dinner", NOON)).toBeNull();
  });

  it("returns null when the selected day isn't today, even if the meal period would otherwise match", () => {
    const hours = hall({ lunch: window("11:00 AM", "2:30 PM") });
    const yesterday = new Date(2026, 7, 18, 12, 0, 0, 0);
    expect(mealTabSubtitle(hours, yesterday, "lunch", NOON)).toBeNull();
  });

  it("returns null when there are no hours for the hall yet (still loading)", () => {
    expect(mealTabSubtitle(undefined, NOON, "lunch", NOON)).toBeNull();
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
