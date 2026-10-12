import vectors from "./vectors.json";
import { loadFixture } from "./fixture";
import { whereAnswer, whenText } from "./where";

const fx = loadFixture();
describe("whereAnswer matches M2", () => {
  for (const v of vectors.where) {
    it(`${v.dish} @ ${v.clock}${"newton" in v ? " (Charles River on)" : ""}`, () => {
      const got = whereAnswer(fx, v.dish, new Date(v.clock), { newton: "newton" in v });
      expect(got).toEqual(v.answer);
      expect(got.map((g, i) => whenText(g, got[i - 1]))).toEqual(v.text);
    });
  }
  it("leaves Charles River servings out while the toggle is off", () => {
    const on = whereAnswer(fx, "Chorizo Jalapeno Quesadilla", new Date(vectors.clock), { newton: true });
    expect(on.flatMap((g) => g.halls)).toContain("c28");
    expect(whereAnswer(fx, "Chorizo Jalapeno Quesadilla", new Date(vectors.clock)).flatMap((g) => g.halls)).not.toContain("c28");
  });
  it("never answers \"now\" from a window that ended at 4:30 PM (Review Focus 2)", () => {
    const late = vectors.where.filter((v) => v.clock.includes("T16:31"));
    expect(late.length).toBeGreaterThan(0);
    for (const v of late) {
      const got = whereAnswer(fx, v.dish, new Date(v.clock), { newton: "newton" in v });
      expect(got.filter((g) => g.st === "now" && g.close === "4:30 PM")).toEqual([]);
    }
    // lunch-only at Worcester: gone at 4:31, so the answer falls through to a later or a tomorrow group
    const d = vectors.where.find((v) => v.clock.includes("T12:41") && v.answer.every((g) => g.meal === "lunch" && g.st === "now" && g.close === "4:30 PM"))!;
    const after = whereAnswer(fx, d.dish, new Date("2026-10-08T16:31:00-04:00"));
    expect(after.every((g) => g.st !== "now" || g.close !== "4:30 PM")).toBe(true);
  });
  it("a window is over at its close minute, not a minute after", () => {
    const d = vectors.where.find((v) => v.answer.some((g) => g.st === "now" && g.close === "4:30 PM"))!;
    const at = (hhmm: string) => whereAnswer(fx, d.dish, new Date(`2026-10-08T${hhmm}:00-04:00`)).filter((g) => g.st === "now" && g.close === "4:30 PM");
    expect(at("16:29").length).toBeGreaterThan(0);
    expect(at("16:30")).toEqual([]);
  });
});
