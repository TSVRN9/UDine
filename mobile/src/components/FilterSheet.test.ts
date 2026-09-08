import type { MenuItem } from "@udine/shared";
import { distinctStations, itemMatchesStationAndPriceFilter, priceBucketFor } from "./FilterSheet";

function nutrition(): MenuItem["nutrition"] {
  return {
    servingSize: "1 each",
    calories: 100,
    caloriesFromFat: 10,
    totalFatG: 1,
    satFatG: 0,
    transFatG: 0,
    cholesterolMg: 0,
    sodiumMg: 0,
    totalCarbG: 1,
    dietaryFiberG: 0,
    sugarsG: 0,
    proteinG: 1,
  };
}

function item(overrides: Partial<MenuItem>): MenuItem {
  return {
    dishName: "Test Dish",
    category: "Entrees",
    mealPeriod: "lunch",
    hallTid: 1,
    date: "2026-09-08",
    nutrition: nutrition(),
    allergens: [],
    dietTags: [],
    ...overrides,
  };
}

describe("priceBucketFor", () => {
  it("buckets under $5, $5-$10 inclusive, and $10+ from a '$N.NN' feed string", () => {
    expect(priceBucketFor("$4.99")).toBe("under-5");
    expect(priceBucketFor("$5.00")).toBe("5-10");
    expect(priceBucketFor("$10.00")).toBe("5-10");
    expect(priceBucketFor("$10.01")).toBe("10-plus");
  });

  it("returns null for an unparseable price string", () => {
    expect(priceBucketFor("free")).toBeNull();
  });
});

describe("distinctStations", () => {
  it("dedupes and trims category whitespace (real feed data trails a space, e.g. 'Grab n'Go Hot ')", () => {
    const items = [item({ category: "Grab n'Go Hot " }), item({ category: "Grab n'Go Hot" }), item({ category: "Entrees" })];
    expect(distinctStations(items)).toEqual(["Entrees", "Grab n'Go Hot"]);
  });
});

describe("itemMatchesStationAndPriceFilter", () => {
  const dish = item({ category: "Entrees ", price: "$7.50" });

  it("passes everything when both filters are empty", () => {
    expect(itemMatchesStationAndPriceFilter(dish, new Set(), new Set())).toBe(true);
  });

  it("excludes an item whose trimmed category isn't in a non-empty station filter", () => {
    expect(itemMatchesStationAndPriceFilter(dish, new Set(["Grab n'Go"]), new Set())).toBe(false);
    expect(itemMatchesStationAndPriceFilter(dish, new Set(["Entrees"]), new Set())).toBe(true);
  });

  it("excludes an item whose price bucket isn't in a non-empty price filter", () => {
    expect(itemMatchesStationAndPriceFilter(dish, new Set(), new Set(["under-5"]))).toBe(false);
    expect(itemMatchesStationAndPriceFilter(dish, new Set(), new Set(["5-10"]))).toBe(true);
  });

  it("excludes a priceless item when a price filter is active", () => {
    const noPriceDish = item({ category: "Entrees" });
    expect(itemMatchesStationAndPriceFilter(noPriceDish, new Set(), new Set(["under-5"]))).toBe(false);
  });
});
