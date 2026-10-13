import { m2Motion } from "../../lib/motion";
import { dayLegs } from "./dayChange";

describe("a day change's two legs", () => {
  it("fade out linear over .35 of the fade through, then in on its curve over the rest, scaling up from .97", () => {
    const l = dayLegs(false);
    expect(l.out.d).toBeCloseTo(m2Motion.fadeThrough.d * m2Motion.sharedX.at);
    expect(l.in.d).toBeCloseTo(m2Motion.fadeThrough.d * (1 - m2Motion.sharedX.at));
    expect(l.out.d + l.in.d).toBeCloseTo(m2Motion.fadeThrough.d);
    expect(l.out.e).toBe(m2Motion.fadeThroughOut.e);
    expect(l.in.e).toBe(m2Motion.fadeThrough.e);
    expect(l.scale).toBe(m2Motion.fadeThrough.scale);
  });
  it("with reduced motion is the 120 ms crossfade between the two legs, and does not scale", () => {
    const l = dayLegs(true);
    expect(l.out.d + l.in.d).toBe(m2Motion.rmFade.d);
    expect(l.out.e).toBe(m2Motion.rmFade.e);
    expect(l.scale).toBe(1);
  });
});
