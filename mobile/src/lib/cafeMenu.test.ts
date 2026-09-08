import type { DishCatalogEntry, MenuItem } from "@udine/shared";
import type { CachedDishCatalog } from "./dishCatalog";
import { cafeStatusPillText, deriveCafeMealTabs, directionsUrl, pickCafeMenuHtml, resolveCafeMenuState, syntheticHallTidForName } from "./cafeMenu";

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

function catalogEntry(dishName: string, overrides: Partial<DishCatalogEntry> = {}): DishCatalogEntry {
  return {
    dishName,
    nutrition: {
      servingSize: "1 serving",
      calories: 120,
      caloriesFromFat: 10,
      totalFatG: 1,
      satFatG: 0,
      transFatG: 0,
      cholesterolMg: 0,
      sodiumMg: 5,
      totalCarbG: 20,
      dietaryFiberG: 1,
      sugarsG: 2,
      proteinG: 3,
    },
    allergens: [],
    dietTags: [],
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function catalog(...entries: DishCatalogEntry[]): CachedDishCatalog {
  return { entries, lastSyncedAt: "2026-08-01T00:00:00.000Z" };
}

const TODAY = new Date(2026, 7, 24);

describe("resolveCafeMenuState (unified café screen waterfall)", () => {
  // Tier 1: the same fetchMenu the 4 dining halls use, keyed by the café's own locationId --
  // non-empty routes to the exact hall-shaped "integrated" state (full nutrition, real tabs).
  test("non-empty ajax items -> integrated, verbatim", () => {
    const items = [item("allday")];
    expect(resolveCafeMenuState(items, "<p>ignored</p>", null, 32, TODAY)).toEqual({ kind: "integrated", items });
  });

  // Tier 2: ajax empty, standing-menu HTML parses to an item list -- each item best-effort matched
  // against the cached dish catalog (searchCachedDishes, same lookup PlateSheet's search uses).
  test("empty ajax + standing HTML items, all matched -> standing state with full-nutrition synthetic items", () => {
    const state = resolveCafeMenuState([], "<p>Bacon Croissant $3.00</p>", catalog(catalogEntry("Bacon Croissant")), 32, TODAY);
    expect(state.kind).toBe("standing");
    if (state.kind !== "standing") throw new Error("unreachable");
    expect(state.entries).toEqual([
      {
        matched: true,
        item: expect.objectContaining({ dishName: "Bacon Croissant", mealPeriod: "allday", hallTid: 32, price: "$3.00" }),
      },
    ]);
  });

  test("empty ajax + standing HTML items with no catalog hit -> standing state, unmatched name+price only", () => {
    const state = resolveCafeMenuState([], "<p>Bacon Croissant $3.00</p>", catalog(), 32, TODAY);
    expect(state).toEqual({ kind: "standing", entries: [{ matched: false, name: "Bacon Croissant", price: "$3.00" }] });
  });

  test("empty ajax + standing HTML, catalog missing entirely (not yet loaded) -> every entry unmatched, never throws", () => {
    const state = resolveCafeMenuState([], "<p>Bacon Croissant $3.00</p>", null, 32, TODAY);
    expect(state).toEqual({ kind: "standing", entries: [{ matched: false, name: "Bacon Croissant", price: "$3.00" }] });
  });

  test("mixed standing menu: some rows match the catalog, some don't, in original order", () => {
    const state = resolveCafeMenuState([], "<p>Coffee</p><p>Bagel $2.50</p>", catalog(catalogEntry("Coffee")), 32, TODAY);
    expect(state.kind).toBe("standing");
    if (state.kind !== "standing") throw new Error("unreachable");
    expect(state.entries).toHaveLength(2);
    expect(state.entries[0]).toMatchObject({ matched: true, item: expect.objectContaining({ dishName: "Coffee" }) });
    expect(state.entries[1]).toEqual({ matched: false, name: "Bagel", price: "$2.50" });
  });

  // Tier 3a: ajax empty, standing HTML is a PDF link (babyBerk/Commonwealth shape) -- info-only,
  // with the existing CafePdfViewer affordance surfaced from inside this same state.
  test("empty ajax + PDF-shaped standing HTML -> info state carrying the pdf link", () => {
    const state = resolveCafeMenuState(
      [],
      '<p><a href="https://umassdining.com/sites/default/files/menu.pdf">Baby Berk Menu</a></p>',
      null,
      61,
      TODAY,
    );
    expect(state).toEqual({ kind: "info", pdf: { url: "https://umassdining.com/sites/default/files/menu.pdf", label: "Baby Berk Menu" } });
  });

  // Tier 3b: nothing at all (no ajax, no html, no PDF -- babyBerk's *_menu fields can also be
  // entirely null) -- info-only, no pdf affordance.
  test("empty ajax + no standing HTML at all -> info state with no pdf", () => {
    expect(resolveCafeMenuState([], null, null, 61, TODAY)).toEqual({ kind: "info", pdf: null });
  });

  test("empty ajax + undefined standing HTML -> info state with no pdf", () => {
    expect(resolveCafeMenuState([], undefined, null, 61, TODAY)).toEqual({ kind: "info", pdf: null });
  });

  // Non-blocking review finding: matchStandingMenuItem's own exact-over-first-hit preference had no
  // coverage that would catch a regression -- pinned here via resolveCafeMenuState's public surface
  // (matchStandingMenuItem itself isn't exported).
  test("prefers an exact (trimmed, case-insensitive) catalog match over an earlier substring-only hit", () => {
    const state = resolveCafeMenuState(
      [],
      "<p>bacon croissant</p>",
      catalog(catalogEntry("Bacon Croissant Deluxe"), catalogEntry("Bacon Croissant")),
      32,
      TODAY,
    );
    expect(state.kind).toBe("standing");
    if (state.kind !== "standing") throw new Error("unreachable");
    expect(state.entries).toEqual([{ matched: true, item: expect.objectContaining({ dishName: "Bacon Croissant" }) }]);
  });
});

describe("syntheticHallTidForName (locationId-less café logging/history identity)", () => {
  // Café-screen unification review finding: a locationId-less café used to share a single `-1`
  // sentinel hallTid with every other one -- this gives each a distinct, stable numeric identity
  // instead (retailHallNames.ts keys its display-name map off the same value, and PlateSheet's
  // history search scopes by it, so two different locationId-less cafés must never collide here).
  test("is deterministic for the same name", () => {
    expect(syntheticHallTidForName("Mystery Cart")).toBe(syntheticHallTidForName("Mystery Cart"));
  });

  test("is distinct for two different names", () => {
    expect(syntheticHallTidForName("Mystery Cart")).not.toBe(syntheticHallTidForName("Taco Truck"));
  });

  // Always negative (<= -2) -- real hall tids (1-4), every known café locationId, and every
  // GRAB_N_GO_TIDS entry are positive, so this can never collide with a genuine numeric identity.
  // -1 itself is excluded too -- CafeSheet.tsx's own unrelated openStatus() placeholder already uses it.
  test("is always <= -2, never colliding with a real tid/locationId or the old -1 placeholder", () => {
    for (const name of ["Mystery Cart", "Taco Truck", "", "Paciugo", "The Hub"]) {
      expect(syntheticHallTidForName(name)).toBeLessThanOrEqual(-2);
    }
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
