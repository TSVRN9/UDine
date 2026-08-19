import { buttonColors, colors, withOpacity } from "./theme";

describe("withOpacity", () => {
  it("appends a hex alpha suffix for the given percentage", () => {
    // 100% -> ff, 0% -> 00, 50% -> 80 (matches web's color-mix(in srgb, X 50%, transparent) look)
    expect(withOpacity("#241a14", 100)).toBe("#241a14ff");
    expect(withOpacity("#241a14", 0)).toBe("#241a1400");
  });

  it("clamps out-of-range percentages instead of producing an invalid hex", () => {
    expect(withOpacity("#241a14", 150)).toBe(withOpacity("#241a14", 100));
    expect(withOpacity("#241a14", -20)).toBe(withOpacity("#241a14", 0));
  });
});

describe("buttonColors", () => {
  it("maps primary to a maroon fill with paper text, mirroring .btn-primary", () => {
    const c = buttonColors("primary");
    expect(c.backgroundColor).toBe(colors.maroon600);
    expect(c.color).toBe(colors.paper50);
  });

  it("maps secondary to an outlined maroon look, mirroring .btn-secondary", () => {
    const c = buttonColors("secondary");
    expect(c.backgroundColor).toBe("transparent");
    expect(c.color).toBe(colors.maroon600);
    expect(c.borderColor).not.toBe("transparent");
  });

  it("maps ghost to a borderless, muted-ink look, mirroring .btn-ghost", () => {
    const c = buttonColors("ghost");
    expect(c.backgroundColor).toBe("transparent");
    expect(c.borderColor).toBe("transparent");
    expect(c.color).not.toBe(colors.maroon600);
  });
});
