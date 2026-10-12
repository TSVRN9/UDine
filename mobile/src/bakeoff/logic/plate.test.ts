import vectors from "./vectors.json";
import { loadFixture, dishKey, servingOn } from "./fixture";
import { emptyPlates, addDish, stepItem, plateHalls, plateLabel, totals, type PlateState } from "./plate";
import type { MealKey, PlaceKey } from "./types";

const fx = loadFixture();
const TODAY = "2026-10-08";
const refsFor = (meal: MealKey, name: string, places: string[]) =>
  Object.fromEntries(places.map((p) => [p, servingOn(fx, TODAY, p as PlaceKey, meal, dishKey(name))!]));
const r1 = (x: number) => Math.round(x * 10) / 10;

describe("plate ops match M2", () => {
  for (const v of vectors.plate) {
    it(v.name, () => {
      let s: PlateState = emptyPlates;
      for (const op of v.ops as any[]) {
        if (op[0] === "add") s = addDish(s, op[1], op[2], refsFor(op[1], op[2], op[3]));
        else if (op[0] === "custom") s = addDish(s, op[1], op[2], {}, op[3]);
        else s = stepItem(s, s.plates[op[1]].id, dishKey(op[2]), op[3]);
      }
      expect(
        s.plates.map((p) => {
          const t = totals(p);
          return { meal: p.meal, halls: plateHalls(p), label: plateLabel(p), items: p.items.map((i) => [i.name, i.qty]),
            totals: { cal: r1(t.cal), p: r1(t.p), c: r1(t.c), f: r1(t.f) } };
        }),
      ).toEqual(v.plates);
      expect(s.front).toBe(v.front);
    });
  }
  it("is pure: the input state is not mutated", () => {
    const a = addDish(emptyPlates, "lunch", "Golden BBQ Chicken Thigh", refsFor("lunch", "Golden BBQ Chicken Thigh", ["W"]));
    const snap = JSON.stringify(a);
    stepItem(a, a.plates[0].id, dishKey("Golden BBQ Chicken Thigh"), -1);
    expect(JSON.stringify(a)).toBe(snap);
    expect(emptyPlates).toEqual({ plates: [], front: 0, nextId: 1 });
  });
  it("1/2 then down removes the item, the empty plate, and keeps front in range (Review Focus 3)", () => {
    let s = addDish(emptyPlates, "lunch", "Golden BBQ Chicken Thigh", refsFor("lunch", "Golden BBQ Chicken Thigh", ["W"]));
    const id = s.plates[0].id, k = dishKey("Golden BBQ Chicken Thigh");
    s = stepItem(s, id, k, -1);
    expect(s.plates[0].items[0].qty).toBe(0.5);
    s = stepItem(s, id, k, -1);
    expect(s.plates).toEqual([]);
    expect(s.front).toBe(0);
  });
  it("macros come from the plate's hall, not the hall the dish was opened in (Review Focus 1)", () => {
    const brisket = refsFor("lunch", "Beef Brisket Noodle Bowl", ["W", "B"]);
    const bbq = refsFor("lunch", "Golden BBQ Chicken Thigh", ["W"]);
    let s = addDish(emptyPlates, "lunch", "Beef Brisket Noodle Bowl", brisket);
    s = addDish(s, "lunch", "Golden BBQ Chicken Thigh", bbq);
    expect(plateHalls(s.plates[0])).toEqual(["W"]);
    expect(totals(s.plates[0]).cal).toBeCloseTo(brisket.W.cal + bbq.W.cal);
    // opened from Berkshire first: the plate item still narrows to W and uses W's macros
    let t = addDish(emptyPlates, "lunch", "Golden BBQ Chicken Thigh", bbq);
    t = addDish(t, "lunch", "Beef Brisket Noodle Bowl", brisket);
    expect(totals(t.plates[0]).cal).toBeCloseTo(brisket.W.cal + bbq.W.cal);
    expect(totals(t.plates[0], "B").cal).toBeCloseTo(brisket.B.cal + bbq.W.cal);   // macroOf falls back to the first ref
  });
});
