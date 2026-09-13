import { macroBadgeRowWidth, shouldTuckBadges } from "./hallMenuBadgeLayout";

describe("macroBadgeRowWidth", () => {
  it("is 0 for no badges", () => {
    expect(macroBadgeRowWidth(0, 15, 4)).toBe(0);
  });

  it("is N badges + (N-1) gaps", () => {
    expect(macroBadgeRowWidth(1, 15, 4)).toBe(15);
    expect(macroBadgeRowWidth(3, 15, 4)).toBe(3 * 15 + 2 * 4);
  });

  it("5-badge max case", () => {
    expect(macroBadgeRowWidth(5, 15, 4)).toBe(5 * 15 + 4 * 4);
  });
});

describe("shouldTuckBadges", () => {
  it("fits exactly at the +gap/+gap boundary", () => {
    // containerWidth - lastLineWidth - gap === badgeRowWidth + gap
    expect(
      shouldTuckBadges({ containerWidth: 300, lastLineWidth: 200, badgeRowWidth: 84, gap: 8 }),
    ).toBe(true);
  });

  it("doesn't fit by 1px", () => {
    expect(
      shouldTuckBadges({ containerWidth: 300, lastLineWidth: 200, badgeRowWidth: 85, gap: 8 }),
    ).toBe(false);
  });

  it("plenty of trailing space on the wrapped last line", () => {
    expect(
      shouldTuckBadges({ containerWidth: 300, lastLineWidth: 100, badgeRowWidth: 90, gap: 8 }),
    ).toBe(true);
  });

  it("last line nearly fills the container (no trailing room)", () => {
    expect(
      shouldTuckBadges({ containerWidth: 300, lastLineWidth: 295, badgeRowWidth: 15, gap: 4 }),
    ).toBe(false);
  });

  it("5-badge row rarely fits beside a wrapped line on a narrow device", () => {
    const badgeRowWidth = macroBadgeRowWidth(5, 15, 4);
    expect(shouldTuckBadges({ containerWidth: 300, lastLineWidth: 220, badgeRowWidth, gap: 8 })).toBe(false);
    expect(shouldTuckBadges({ containerWidth: 300, lastLineWidth: 60, badgeRowWidth, gap: 8 })).toBe(true);
  });
});
