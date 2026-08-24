import type { MenuItem } from "@udine/shared";
import { cafeStatusPillText, cafeTapTarget, deriveCafeMealTabs, directionsUrl, pickCafeMenuHtml } from "./cafeMenu";

function item(mealPeriod: MenuItem["mealPeriod"], dishName = "Coffee"): MenuItem {
  return {
    dishName,
    category: "Beverages",
    mealPeriod,
    hallTid: 32,
    date: "2026-08-24",
    nutrition: {
      servingSize: "1 cup",
      calories: 5,
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

describe("cafeTapTarget", () => {
  // The three branches the issue's runtime model enumerates (plus the undefined-locationId case
  // the comments call out as a fourth): non-empty fetchMenu -> menu; empty -> sheet; no locationId
  // at all -> sheet without ever having called fetchMenu.
  test("non-empty items routes to the hall-style menu screen", () => {
    expect(cafeTapTarget(32, [item("allday")])).toEqual({ kind: "menu" });
  });

  test("empty items routes to the fallback sheet", () => {
    expect(cafeTapTarget(32, [])).toEqual({ kind: "sheet" });
  });

  test("undefined locationId routes to the fallback sheet even with items around", () => {
    expect(cafeTapTarget(undefined, [item("allday")])).toEqual({ kind: "sheet" });
  });
});

describe("deriveCafeMealTabs", () => {
  test("returns periods in first-seen order, deduped", () => {
    const items = [item("breakfast"), item("lunch"), item("breakfast", "Bagel"), item("grabngo")];
    expect(deriveCafeMealTabs(items)).toEqual(["breakfast", "lunch", "grabngo"]);
  });

  test("returns a single 'allday' tab for a People's-Organic-shaped café (no breakfast/lunch/dinner split)", () => {
    expect(deriveCafeMealTabs([item("allday"), item("allday", "Bagel")])).toEqual(["allday"]);
  });

  test("returns [] for no items", () => {
    expect(deriveCafeMealTabs([])).toEqual([]);
  });
});

describe("cafeStatusPillText", () => {
  test("open: 'OPEN · TIL <time>', matching the styling spec's copy verbatim", () => {
    expect(cafeStatusPillText({ open: true, closesAt: new Date(2026, 7, 24, 18, 0) })).toBe("OPEN · TIL 6:00 PM");
  });

  test("closed: 'CLOSED'", () => {
    expect(cafeStatusPillText({ open: false, opensAt: null })).toBe("CLOSED");
  });
});

describe("directionsUrl", () => {
  test("a real 'lat,long' produces a maps link", () => {
    expect(directionsUrl("42.3915402,-72.5292962")).toBe("https://maps.google.com/?q=42.3915402,-72.5292962");
  });

  // CLAUDE.md-cited babyBerk degenerate case -- present but garbage, must not open a blank/bogus query.
  test("babyBerk's degenerate ',' produces no link", () => {
    expect(directionsUrl(",")).toBeNull();
  });

  test("undefined/missing mapAddress produces no link", () => {
    expect(directionsUrl(undefined)).toBeNull();
  });
});

describe("pickCafeMenuHtml", () => {
  test("prefers breakfastMenu, then lunchMenu, then dinnerMenu", () => {
    expect(pickCafeMenuHtml({ breakfastMenu: "<p>B</p>", lunchMenu: "<p>L</p>", dinnerMenu: null })).toBe("<p>B</p>");
    expect(pickCafeMenuHtml({ breakfastMenu: null, lunchMenu: "<p>L</p>", dinnerMenu: "<p>D</p>" })).toBe("<p>L</p>");
    expect(pickCafeMenuHtml({ breakfastMenu: null, lunchMenu: null, dinnerMenu: "<p>D</p>" })).toBe("<p>D</p>");
  });

  test("null when all three are absent", () => {
    expect(pickCafeMenuHtml({ breakfastMenu: null, lunchMenu: undefined, dinnerMenu: null })).toBeNull();
  });
});
