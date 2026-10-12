import vectors from "../logic/labelVectors.json";
import { loadFixture } from "../logic/fixture";
import { labelRows, restingSnap, sheetMarks } from "../logic/dishSheet";

const fx = loadFixture();
const dish = (name: string) => fx.dishes.find((d) => d.name === name)!;

describe("restingSnap (M2 dishMid): the resting height ends just under the label's Calories row", () => {
  const win = { winH: 800, top: 24 };
  it("is the grab strip, the content down to the bottom of Calories, and the 6 dp sliver", () => {
    expect(restingSnap({ calBottom: 410, grab: 22, ...win })).toBe(22 + 410 + 6);
  });
  it("never exceeds the top detent (winH - top - 8)", () => {
    expect(restingSnap({ calBottom: 900, grab: 22, ...win })).toBe(800 - 24 - 8);
  });
  it("moves with the content: a taller name pushes the Calories row, and the snap, down", () => {
    expect(restingSnap({ calBottom: 450, grab: 22, ...win })).toBeGreaterThan(restingSnap({ calBottom: 410, grab: 22, ...win }));
  });
});

describe("sheetMarks: the patch row is exactly what the dish and the toggles give (Review Focus 5)", () => {
  const unscored = fx.dishes.find((d) => d.health == null && d.carbon == null && !(d.diet & 31))!;
  const scored = fx.dishes.find((d) => d.health != null && d.carbon != null)!;
  it("an unscored, unmarked dish has no row at all, whatever the toggles", () => {
    expect(sheetMarks(unscored, { health: true, carbon: true })).toBeNull();
    expect(sheetMarks(unscored, { health: false, carbon: false })).toBeNull();
  });
  it("a dish with a healthfulness number but no H code draws no healthfulness and leaves no slot", () => {
    const raw = fx.dishes.find((d) => d.health == null && d.carbon != null && !(d.diet & 31))!;
    expect(sheetMarks(raw, { health: true, carbon: false })).toBeNull();
    expect(sheetMarks(raw, { health: true, carbon: true })).toEqual({ marks: [], health: null, carbon: raw.carbon });
  });
  it("the score slots follow the toggles and only exist when the dish is scored", () => {
    expect(sheetMarks(scored, { health: false, carbon: false })?.health ?? null).toBeNull();
    expect(sheetMarks(scored, { health: true, carbon: false })).toEqual(expect.objectContaining({ health: scored.health, carbon: null }));
    expect(sheetMarks(scored, { health: false, carbon: true })).toEqual(expect.objectContaining({ health: null, carbon: scored.carbon }));
  });
  it("plant based wins over vegetarian; halal, local and sustainable follow in M2's order", () => {
    const d = { ...unscored, diet: 1 | 2 | 4 | 8 | 16 };
    expect(sheetMarks(d, { health: false, carbon: false })?.marks).toEqual(["plant", "halal", "local", "sus"]);
    expect(sheetMarks({ ...unscored, diet: 1 }, { health: false, carbon: false })?.marks).toEqual(["veg"]);
  });
});

describe("labelRows match M2's labelHTML (%DV published, computed from the FDA base, or blank)", () => {
  for (const v of vectors.vectors) {
    it(v.dish, () => {
      const d = dish(v.dish);
      const got = labelRows(d.nutrition, d.cal, d.serving);
      expect(got.cal).toBe(v.cals);
      expect(got.rows.map((r) => [r.left, r.right])).toEqual(v.rows);
    });
  }
  it("the serving row only when the dish has a serving; the Fat cal. row only when the feed has it", () => {
    const d = dish("Add Crispy Chicken");
    expect(labelRows(d.nutrition, d.cal, "").serving).toBeNull();
    expect(labelRows(d.nutrition, d.cal, "").rows[0].right).toBe("% Daily Value*");
    expect(labelRows(dish("Golden BBQ Chicken Thigh").nutrition, 93, "1 each").serving).toBe("1 each");
  });
});
