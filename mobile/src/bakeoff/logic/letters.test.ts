import { HALL_LX } from "./letters";

// M2 round 10: the ink's left edge in a band of width w is w - 200 + LX + bearing; at 390 it is W 262, F 296, H 285.5, B 288.
describe("hall letter positions", () => {
  it("are M2's LX", () => expect(HALL_LX).toEqual({ W: 72, F: 99, H: 88, B: 91 }));
  it("keep the loose column: W is furthest left and F furthest right", () => {
    expect(HALL_LX.W).toBeLessThan(HALL_LX.H);
    expect(HALL_LX.H).toBeLessThan(HALL_LX.B);
    expect(HALL_LX.F).toBeGreaterThan(HALL_LX.B);
  });
});
