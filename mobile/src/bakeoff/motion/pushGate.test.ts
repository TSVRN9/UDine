import { closedGate, gateStep, halfwayOut } from "./pushGate";

it("starts only when settled and the sheet is half-way out, in either order, once", () => {
  const a = gateStep(closedGate, "settled");
  expect(a.start).toBe(false);
  const b = gateStep(a.gate, "go");
  expect(b.start).toBe(true);
  expect(gateStep(b.gate, "go").start).toBe(false);
  const c = gateStep(gateStep(closedGate, "go").gate, "settled");
  expect(c.start).toBe(true);
});
it("the sheet alone, or the hall alone, never starts it", () => {
  expect(gateStep(closedGate, "go").start).toBe(false);
  expect(gateStep(closedGate, "settled").start).toBe(false);
});

describe("halfwayOut (M2 `sh.away`: the follow-up runs once the sheet is half-way to closed)", () => {
  it("is the midpoint between where the sheet is and the closed position", () => {
    expect(halfwayOut(140, 640)).toBe(390);
    expect(halfwayOut(640, 640)).toBe(640);
  });
});
