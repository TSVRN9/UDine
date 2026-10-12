import { pagerStep, type Phase } from "./pagerMachine";

const run = (events: Parameters<typeof pagerStep>[1][]): { phase: Phase; accepted: boolean[] } => {
  let phase: Phase = "idle";
  const accepted: boolean[] = [];
  for (const e of events) {
    const next = pagerStep(phase, e);
    accepted.push(next !== null);
    if (next) phase = next;
  }
  return { phase, accepted };
};

describe("pager hold/shift bookkeeping: no interleaving strands the labels or a ghost", () => {
  it("a day change runs hold, ready, done and ends idle", () => {
    expect(run(["hold", "ready", "done"])).toEqual({ phase: "idle", accepted: [true, true, true] });
  });
  it("a meal change runs shift, done and ends idle", () => {
    expect(run(["shift", "done"])).toEqual({ phase: "idle", accepted: [true, true] });
  });
  it("day then meal before the commit: the meal change is refused, the day change completes", () => {
    expect(run(["hold", "shift", "ready", "done"])).toEqual({ phase: "idle", accepted: [true, false, true, true] });
  });
  it("day then a data change before the commit: ready still arrives once and completes", () => {
    // a data change is not an event of its own: the pager's effect sends `ready` for the first commit whatever caused it
    expect(run(["hold", "ready", "ready", "done"]).phase).toBe("idle");
  });
  it("a meal change during the day's out-fade is refused", () => {
    expect(run(["hold", "ready", "shift", "done"])).toEqual({ phase: "idle", accepted: [true, true, false, true] });
  });
  it("day then day is refused while the first is running, and works after it", () => {
    expect(run(["hold", "hold", "ready", "done", "hold", "ready", "done"])).toEqual({
      phase: "idle", accepted: [true, false, true, true, true, true, true],
    });
  });
  it("a day change during a meal slide is refused; after the slide it works", () => {
    expect(run(["shift", "hold", "done", "hold", "ready", "done"]).accepted).toEqual([true, false, true, true, true, true]);
  });
  it("a stray ready or done while idle changes nothing", () => {
    expect(run(["ready", "done"])).toEqual({ phase: "idle", accepted: [false, false] });
  });
  it("every sequence of events ends idle once its done events have arrived", () => {
    const evs = ["hold", "shift", "ready", "done"] as const;
    for (let n = 0; n < 4 ** 5; n++) {
      const seq = Array.from({ length: 5 }, (_, i) => evs[(n >> (2 * i)) & 3]);
      let ph: Phase = "idle";
      for (const e of seq) ph = pagerStep(ph, e) ?? ph;
      for (const e of ["ready", "done"] as const) ph = pagerStep(ph, e) ?? ph;   // the pending animation finishing
      for (const e of ["done"] as const) ph = pagerStep(ph, e) ?? ph;
      expect(ph).toBe("idle");
    }
  });
});
