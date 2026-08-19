import { buttonColors, colors, withOpacity } from "./theme";

describe("colors", () => {
  it("mirrors web/src/app.css's @theme palette hex-for-hex", () => {
    expect(colors.maroon900).toBe("#3b0a0f");
    expect(colors.maroon600).toBe("#7c2430");
    expect(colors.gold500).toBe("#c99a2e");
    expect(colors.cream100).toBe("#f3ead8");
    expect(colors.paper50).toBe("#fbf7ef");
    expect(colors.ink900).toBe("#241a14");
  });
});

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
