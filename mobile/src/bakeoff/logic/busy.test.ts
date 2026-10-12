import { loadFixture } from "./fixture";
import { boardAt, busyView, lamps } from "./busy";

const fx = loadFixture();
const NOW = 12 * 60 + 41;

describe("busy values are M2's simulated lunch rush", () => {
  it("pins the four halls' raw values", () => {
    expect(fx.busy.W).toMatchObject({ pct: 82, label: "Busy", confidence: "good", calmer_at: "13:30", vs_usual: "usual" });
    expect(fx.busy.F).toMatchObject({ pct: 48, label: "A little busy", confidence: "new", calmer_at: null, vs_usual: "usual" });
    expect(fx.busy.H).toMatchObject({ pct: 27, label: "Not busy", confidence: "good", calmer_at: null, vs_usual: "quieter" });
    expect(fx.busy.B).toMatchObject({ pct: 88, label: "Busy", confidence: "new", calmer_at: null, vs_usual: "busier" });
    expect(fx.busy.W.outlook.map((o) => o.pct)).toEqual([70, 55, 40]);
    expect(fx.busy.B.outlook.map((o) => o.pct)).toEqual([80, 68, null]);
    expect(fx.typical.W).toEqual([7, [15, 25, 30, 22, 30, 62, 86, 70, 40, 30, 45, 70, 82, 60, 40, 30, 22]]);
    expect(fx.typical.B[0]).toBe(11);
  });
});

describe("busyView (M2 busyRow)", () => {
  it("lamps: ceil(pct/20), at least one", () => {
    expect([lamps(0), lamps(1), lamps(20), lamps(21), lamps(82), lamps(100)]).toEqual([1, 1, 1, 2, 5, 5]);
  });
  it.each([
    ["W", 5, "Busy", "Calmer around 1:30 PM"],
    ["F", 3, "Probably a little busy", ""],
    ["H", 2, "Not busy", "Quieter than usual"],
    ["B", 5, "Probably busy", "Busier than usual"],
  ] as const)("%s: %i lamps, %s", (h, n, word, extra) => {
    const v = busyView(fx.busy[h]);
    expect(v).toMatchObject({ lamps: n, word, extra });
  });
});

describe("boardAt (M2 histSVG)", () => {
  it("W at 12:41: column 5 (12 PM) is now and lit by the live pct, later hours use the outlook, earlier the typical day", () => {
    const b = boardAt(fx.typical.W, fx.busy.W, NOW);
    expect(b).toHaveLength(17);
    expect(b[5]).toEqual({ lit: 5, now: true });
    // M2 indexes the outlook by hours ahead (outlook[i - nowI]), so +1 h reads the "in 60" point and +2 h the "in 90" one
    expect(b[6]).toEqual({ lit: lamps(55), now: false });
    expect(b[7]).toEqual({ lit: lamps(40), now: false });
    expect(b[8]).toEqual({ lit: lamps(40), now: false }); // past the outlook: typical (also 40)
    expect(b[9]).toEqual({ lit: lamps(30), now: false });
    expect(b[0]).toEqual({ lit: lamps(15), now: false });
  });
  it("a null outlook point falls back to the typical value", () => {
    const b = boardAt(fx.typical.B, fx.busy.B, NOW);
    expect(b[1]).toEqual({ lit: lamps(88), now: true });
    expect(b[2]).toEqual({ lit: lamps(68), now: false });
    expect(b[3]).toEqual({ lit: lamps(45), now: false });
    expect(b[4]).toEqual({ lit: lamps(30), now: false });
  });
});
