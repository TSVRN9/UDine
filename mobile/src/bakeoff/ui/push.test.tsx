import { m2 } from "../../lib/theme";
import { m2Motion } from "../../lib/motion";
import { pushShadowAt, pushBelowAt } from "./push";

// M2 `.pushing{box-shadow:-1px 0 0 rgba(36,10,14,.08),-10px 0 28px rgba(36,10,14,.16)}` (src.html:54): only while the page moves
describe("the shadow a pushed page casts on the screen it covers", () => {
  it.each([0, 1])("is not there at rest (p = %s)", (p) => expect(pushShadowAt(p)).toEqual([]));
  it("is the two layers of M2's `.pushing` while it moves", () => {
    expect(pushShadowAt(0.5)).toEqual(m2.shadow.push.map((s) => ({ offsetX: s.x, offsetY: s.y, blurRadius: s.blur, color: s.color })));
    expect(pushShadowAt(0.5)).toHaveLength(2);
  });
});

describe("the screen a page is pushed over (M2 `MO.push`)", () => {
  it("rests in place and undimmed while the page is off to the right (p = 1)", () => expect(pushBelowAt(1, 360)).toEqual({ shift: -0, dim: 0 }));
  it("is shifted left by 30% of the width and dimmed to 10% once the page is in (p = 0)", () => {
    expect(pushBelowAt(0, 360)).toEqual({ shift: -m2Motion.push.shift * 360, dim: m2Motion.push.dim });
  });
  it("follows the page: half-way in, half-way shifted", () => expect(pushBelowAt(0.5, 360).shift).toBeCloseTo(-54));
});
