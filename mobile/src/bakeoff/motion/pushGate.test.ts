import { closedGate, gateStep } from "./pushGate";

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
