import type { NutritionFacts } from "@udine/shared";
import { buildLabelRows, formatDv, formatGrams, formatMg } from "./nutritionLabel";

describe("formatGrams", () => {
  it("appends g and rounds to one decimal", () => {
    expect(formatGrams(2.94)).toBe("2.9g");
    expect(formatGrams(0)).toBe("0g");
  });
});

describe("formatMg", () => {
  it("appends mg and rounds to the nearest whole number", () => {
    expect(formatMg(50.9)).toBe("51mg");
    expect(formatMg(0)).toBe("0mg");
  });
});

describe("formatDv", () => {
  it("renders a percent sign for a present value, rounded", () => {
    expect(formatDv(16)).toBe("16%");
    expect(formatDv(4.6)).toBe("5%");
  });

  it("renders an em dash for null/undefined (no established DV, e.g. trans fat)", () => {
    expect(formatDv(null)).toBe("—");
    expect(formatDv(undefined)).toBe("—");
  });

  it("renders 0% for an actual zero DV, distinct from no DV at all", () => {
    expect(formatDv(0)).toBe("0%");
  });
});

function nutrition(overrides: Partial<NutritionFacts> = {}): NutritionFacts {
  return {
    servingSize: "1 each",
    calories: 127,
    caloriesFromFat: 26,
    totalFatG: 2.9,
    satFatG: 0.5,
    transFatG: 0,
    cholesterolMg: 50.9,
    sodiumMg: 237.2,
    totalCarbG: 20.4,
    dietaryFiberG: 1,
    sugarsG: 3.4,
    proteinG: 5.3,
    totalFatDv: 4,
    satFatDv: null,
    cholesterolDv: null,
    sodiumDv: 10,
    totalCarbDv: 16,
    dietaryFiberDv: 3,
    sugarsDv: null,
    proteinDv: 9,
    ...overrides,
  };
}

describe("buildLabelRows", () => {
  it("builds FDA-order rows with amount + DV%, sub-rows indented, no DV column for trans fat/sugars", () => {
    const rows = buildLabelRows(nutrition());
    expect(rows.map((r) => r.label)).toEqual([
      "Total Fat",
      "Saturated Fat",
      "Trans Fat",
      "Cholesterol",
      "Sodium",
      "Total Carbohydrate",
      "Dietary Fiber",
      "Total Sugars",
      "Protein",
    ]);

    const totalFat = rows.find((r) => r.label === "Total Fat")!;
    expect(totalFat.amount).toBe("2.9g");
    expect(totalFat.dv).toBe("4%");
    expect(totalFat.indent).toBeFalsy();

    const satFat = rows.find((r) => r.label === "Saturated Fat")!;
    expect(satFat.indent).toBe(true);
    expect(satFat.dv).toBe("—"); // present-but-blank source attribute

    const transFat = rows.find((r) => r.label === "Trans Fat")!;
    expect(transFat.dv).toBeNull(); // FDA label has no %DV column for trans fat at all

    const sodium = rows.find((r) => r.label === "Sodium")!;
    expect(sodium.amount).toBe("237mg");
    expect(sodium.dv).toBe("10%");

    const protein = rows.find((r) => r.label === "Protein")!;
    expect(protein.amount).toBe("5.3g");
    expect(protein.dv).toBe("9%");
  });

  it("shows a DV of 0% when the source reports 0, not a blank dash", () => {
    const rows = buildLabelRows(nutrition({ sodiumDv: 0 }));
    expect(rows.find((r) => r.label === "Sodium")!.dv).toBe("0%");
  });

  it("shows a dash for DV columns that support it when the source has no DV data at all (e.g. an OFF item)", () => {
    const rows = buildLabelRows(nutrition({ totalFatDv: undefined, sodiumDv: undefined }));
    expect(rows.find((r) => r.label === "Total Fat")!.dv).toBe("—");
    expect(rows.find((r) => r.label === "Sodium")!.dv).toBe("—");
  });
});
