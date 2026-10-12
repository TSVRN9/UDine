import { m2Motion } from "../../lib/motion";
import { incomingOpacity, outgoingOpacity, rectAt, settleTarget, transition, type Machine } from "./containerMath";

const from = { top: 300, height: 112 };
const to = { top: 0, height: 800 };
const at = (m: Machine, ...ev: Parameters<typeof transition>[1][]) => ev.reduce(transition, m);
const closed: Machine = { phase: "closed", run: 0 };

describe("rectAt", () => {
  it("is the band at 0 and the screen at 1, monotonic between", () => {
    expect(rectAt(from, to, 0)).toEqual(from);
    expect(rectAt(from, to, 1)).toEqual(to);
    let prev = rectAt(from, to, 0);
    for (let p = 0.1; p <= 1.001; p += 0.1) {
      const r = rectAt(from, to, p);
      expect(r.top).toBeLessThanOrEqual(prev.top);
      expect(r.height).toBeGreaterThanOrEqual(prev.height);
      prev = r;
    }
  });
});

describe("content fades", () => {
  it("outgoing is gone by the early-fade fraction, incoming starts there", () => {
    expect(outgoingOpacity(0)).toBe(1);
    expect(outgoingOpacity(m2Motion.contFade)).toBe(0);
    expect(outgoingOpacity(1)).toBe(0);
    expect(incomingOpacity(0)).toBe(0);
    expect(incomingOpacity(m2Motion.contFade)).toBe(0);
    expect(incomingOpacity(1)).toBe(1);
    expect(incomingOpacity(0.65)).toBeCloseTo(0.5, 5);
  });
});

describe("settleTarget (M2: close below commit or on a flick)", () => {
  it("closes below the commit point", () => expect(settleTarget(0, 0.5)).toBe("closed"));
  it("opens at or past the commit point at rest", () => expect(settleTarget(0, 0.9)).toBe("open"));
  it("a flick toward closing wins past the commit point", () => expect(settleTarget(0.6, 0.95)).toBe("closed"));
  it("a flick at exactly the threshold does not", () => expect(settleTarget(m2Motion.dragBack.flick, 0.95)).toBe("open"));
  it("a flick back toward open does not close", () => expect(settleTarget(-0.6, 0.9)).toBe("open"));
});

describe("interruption reducer (Review Focus 4)", () => {
  it("open then finish lands open, close then finish lands closed", () => {
    const o = at(closed, { type: "open" });
    expect(o.phase).toBe("opening");
    expect(at(o, { type: "done", run: o.run }).phase).toBe("open");
    const c = at(o, { type: "done", run: o.run }, { type: "close" });
    expect(c.phase).toBe("closing");
    expect(at(c, { type: "done", run: c.run }).phase).toBe("closed");
  });
  it("open during a running close resolves to open; the close's late finish is ignored", () => {
    const c = at(closed, { type: "open" }, { type: "done", run: 1 }, { type: "close" });
    const o = transition(c, { type: "open" });
    expect(o.phase).toBe("opening");
    const stale = transition(o, { type: "done", run: c.run });
    expect(stale).toEqual(o);
    expect(transition(stale, { type: "done", run: o.run }).phase).toBe("open");
  });
  it("close during a running open reverses it", () => {
    const o = at(closed, { type: "open" });
    const c = transition(o, { type: "close" });
    expect(c.phase).toBe("closing");
    expect(transition(c, { type: "done", run: o.run })).toEqual(c);
  });
  it("a grab cancels the running animation; releasing settles per the release target", () => {
    const o = at(closed, { type: "open" });
    const g = transition(o, { type: "grab" });
    expect(g.phase).toBe("dragging");
    expect(transition(g, { type: "done", run: o.run })).toEqual(g);
    expect(transition(g, { type: "release", to: "closed" }).phase).toBe("closing");
    expect(transition(g, { type: "release", to: "open" }).phase).toBe("opening");
  });
  it("only a finished close frees the band: the overlay is mounted in every other phase", () => {
    const phases = [closed, at(closed, { type: "open" }), at(closed, { type: "open" }, { type: "grab" }), at(closed, { type: "open" }, { type: "close" })];
    expect(phases.map((m) => m.phase !== "closed")).toEqual([false, true, true, true]);
  });
  it("events that make no sense in a phase leave it unchanged", () => {
    expect(transition(closed, { type: "close" })).toEqual(closed);
    expect(transition(closed, { type: "grab" })).toEqual(closed);
    expect(transition(closed, { type: "release", to: "open" })).toEqual(closed);
  });
});
