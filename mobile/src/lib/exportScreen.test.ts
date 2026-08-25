import type { Favorite, LogEntry } from "@udine/shared";
import { buildExportPlan, favoritesSubline, logSubline, rankedSubline, selectedStoreLabel } from "./exportScreen";

function entry(id: string, loggedAt: string): LogEntry {
  return { id, loggedAt, source: { type: "umass-menu", dishName: "X", hallTid: 1 }, servings: 1, nutrition: { servingSize: "1", calories: 1, caloriesFromFat: 1, totalFatG: 1, satFatG: 1, transFatG: 0, cholesterolMg: 1, sodiumMg: 1, totalCarbG: 1, dietaryFiberG: 1, sugarsG: 1, proteinG: 1 } };
}

describe("logSubline", () => {
  it("joins entry count with the earliest date, per the artboard's `214 entries · since Aug 2`", () => {
    const entries = [entry("a", "2026-08-05T12:00:00.000Z"), entry("b", "2026-08-02T09:00:00.000Z"), entry("c", "2026-08-10T09:00:00.000Z")];
    expect(logSubline(entries)).toBe("3 entries · since Aug 2");
  });

  it("has no dangling ' · since' with zero entries", () => {
    expect(logSubline([])).toBe("0 entries");
  });
});

describe("rankedSubline", () => {
  it("sums comparisonCount across ranked items, not the ranked count itself", () => {
    const items = [{ comparisonCount: 3 }, { comparisonCount: 3 }, { comparisonCount: 5 }];
    expect(rankedSubline(items)).toBe("3 ranked · 11 comparisons");
  });

  it("is zero-safe", () => {
    expect(rankedSubline([])).toBe("0 ranked · 0 comparisons");
  });
});

describe("favoritesSubline", () => {
  it("counts favorites", () => {
    const favorites: Favorite[] = [{ type: "dish", dishName: "A" }, { type: "location", hallTid: 1 }];
    expect(favoritesSubline(favorites)).toBe("2 favorites");
  });
});

describe("selectedStoreLabel", () => {
  it("joins short names in STORE_ORDER, regardless of selection order", () => {
    expect(selectedStoreLabel(["favorites", "log", "dishRankings"])).toBe("log · dish rankings · favorites");
  });

  it("is empty with nothing selected", () => {
    expect(selectedStoreLabel([])).toBe("");
  });
});

describe("buildExportPlan", () => {
  it("builds one job per selected store for a single format", () => {
    expect(buildExportPlan(["log", "favorites"], "csv")).toEqual([
      { store: "log", format: "csv" },
      { store: "favorites", format: "csv" },
    ]);
  });

  it("BOTH produces two jobs per selected store -- json then csv, both artifacts", () => {
    expect(buildExportPlan(["log"], "both")).toEqual([
      { store: "log", format: "json" },
      { store: "log", format: "csv" },
    ]);
  });

  it("orders jobs by STORE_ORDER, not selection order", () => {
    expect(buildExportPlan(["favorites", "log"], "csv")).toEqual([
      { store: "log", format: "csv" },
      { store: "favorites", format: "csv" },
    ]);
  });

  it("is empty with nothing selected -- the zero-selection guard case", () => {
    expect(buildExportPlan([], "both")).toEqual([]);
  });
});
