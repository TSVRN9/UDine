import { macroBadgeRowWidth, shouldTuckBadges } from "./hallMenuBadgeLayout";

describe("macroBadgeRowWidth", () => {
  it("is 0 for no badges", () => {
    expect(macroBadgeRowWidth(0, 15, 4)).toBe(0);
  });

  it("is N badges + (N-1) gaps", () => {
    expect(macroBadgeRowWidth(1, 15, 4)).toBe(15);
    expect(macroBadgeRowWidth(3, 15, 4)).toBe(3 * 15 + 2 * 4);
  });

  // Pure geometry -- doesn't know or care that 5 simultaneous badges is unreachable in the actual
  // product (menuItemMacroBadges suppresses high-fiber whenever high-protein also qualifies, so
  // the real ceiling is 4 -- see [slug].tsx's stressFixtureItems doc). Kept as a general N case,
  // not a claim about what the app can show.
  it("handles a count higher than the app ever actually reaches", () => {
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

  it("a wide badge row rarely fits beside a wrapped line on a narrow device", () => {
    const badgeRowWidth = macroBadgeRowWidth(5, 15, 4);
    expect(shouldTuckBadges({ containerWidth: 300, lastLineWidth: 220, badgeRowWidth, gap: 8 })).toBe(false);
    expect(shouldTuckBadges({ containerWidth: 300, lastLineWidth: 60, badgeRowWidth, gap: 8 })).toBe(true);
  });
});

// Pins the exact reference numbers hall-menu-badge-tuck-fixture-gap.md's investigation measured
// on-device 2026-09-17 (Agent_Emulator_Narrow, docs/agents/emulator-pool.md): MACRO_BADGE_SIZE=15,
// MACRO_BADGE_GAP=spacing(1)=4, NAME_BADGE_GAP=spacing(2)=7 (that device's spacing() scale), at a
// 229dp dish-row containerWidth. These are a REFERENCE snapshot of one device/font pairing, not a
// source of truth -- spacing() is scaled per device width (theme.ts's typeScale), so a different
// screen width or a font-metric change moves the actual dp values. What's pinned here is the
// FORMULA's behavior at these numbers (an off-by-one in shouldTuckBadges/macroBadgeRowWidth would
// break this), not a claim that every device sees exactly 200/181/162/143dp thresholds.
describe("reference thresholds (2026-09-17, 229dp container, real MACRO_BADGE_SIZE/MACRO_BADGE_GAP/NAME_BADGE_GAP)", () => {
  const CONTAINER_WIDTH = 229;
  const BADGE_SIZE = 15;
  const BADGE_GAP = 4;
  const NAME_GAP = 7;
  // threshold(n) = containerWidth - 2*NAME_GAP - badgeRowWidth(n)
  const THRESHOLDS: Record<number, number> = { 1: 200, 2: 181, 3: 162, 4: 143 };

  it.each([1, 2, 3, 4])("badge count %i's threshold matches containerWidth - 2*gap - badgeRowWidth(n)", (n) => {
    const badgeRowWidth = macroBadgeRowWidth(n, BADGE_SIZE, BADGE_GAP);
    expect(CONTAINER_WIDTH - 2 * NAME_GAP - badgeRowWidth).toBe(THRESHOLDS[n]);
  });

  it.each([1, 2, 3, 4])("tucks exactly AT badge count %i's threshold (both gaps' full slack, boundary inclusive)", (n) => {
    const badgeRowWidth = macroBadgeRowWidth(n, BADGE_SIZE, BADGE_GAP);
    expect(
      shouldTuckBadges({ containerWidth: CONTAINER_WIDTH, lastLineWidth: THRESHOLDS[n], badgeRowWidth, gap: NAME_GAP }),
    ).toBe(true);
  });

  it.each([1, 2, 3, 4])("untucks just past badge count %i's threshold", (n) => {
    const badgeRowWidth = macroBadgeRowWidth(n, BADGE_SIZE, BADGE_GAP);
    expect(
      shouldTuckBadges({ containerWidth: CONTAINER_WIDTH, lastLineWidth: THRESHOLDS[n] + 1, badgeRowWidth, gap: NAME_GAP }),
    ).toBe(false);
  });
});

// The actual regression this whole brief exists for: hall-menu-badge-tuck-fixture-gap.md found
// that BOTH names --stress long-names shipped (94.97dp/56.96dp last lines) tuck at every reachable
// badge count (1-4) on a 229dp container, so #449/#452/#454/#455's on-device "verified the tuck
// decision" claims verified nothing -- same failure class as
// synthetic-input-tests-are-not-device-verification. The fixture committed in [slug].tsx's
// stressFixtureItems (measured lastLineWidth 172.77dp, same 229dp container, its own comment has
// the full derivation) actually straddles a boundary: tucks with 2 macro badges showing, untucks
// with 3. This straddle test is the fixture's own asserted contract, and running it against the
// OLD (broken) fixture width demonstrates the exact gap this task closes.
describe("hall-menu-badge-tuck-fixture-gap: the committed fixture actually straddles a boundary", () => {
  const CONTAINER_WIDTH = 229;
  const BADGE_SIZE = 15;
  const BADGE_GAP = 4;
  const NAME_GAP = 7;
  // [slug].tsx stressFixtureItems's first item, "...HarvestMedleyDeluxeStack" -- see its own
  // comment for the measurement.
  const FIXTURE_LAST_LINE_WIDTH = 172.77;

  it("tucks at 2 macro badges", () => {
    const badgeRowWidth = macroBadgeRowWidth(2, BADGE_SIZE, BADGE_GAP);
    expect(
      shouldTuckBadges({ containerWidth: CONTAINER_WIDTH, lastLineWidth: FIXTURE_LAST_LINE_WIDTH, badgeRowWidth, gap: NAME_GAP }),
    ).toBe(true);
  });

  it("untucks at 3 macro badges -- the actual boundary crossing", () => {
    const badgeRowWidth = macroBadgeRowWidth(3, BADGE_SIZE, BADGE_GAP);
    expect(
      shouldTuckBadges({ containerWidth: CONTAINER_WIDTH, lastLineWidth: FIXTURE_LAST_LINE_WIDTH, badgeRowWidth, gap: NAME_GAP }),
    ).toBe(false);
  });

  // RED without this task's fixture: the two --stress long-names names that shipped before this
  // PR (94.97dp/56.96dp) tuck at every reachable badge count, so this never crosses -- proving
  // those PRs' on-device "verified the tuck decision" claims tested nothing about the boundary.
  it("the OLD fixture widths never cross the boundary at any reachable badge count (why this task exists)", () => {
    for (const oldWidth of [94.97, 56.96]) {
      for (let n = 1; n <= 4; n++) {
        const badgeRowWidth = macroBadgeRowWidth(n, BADGE_SIZE, BADGE_GAP);
        expect(shouldTuckBadges({ containerWidth: CONTAINER_WIDTH, lastLineWidth: oldWidth, badgeRowWidth, gap: NAME_GAP })).toBe(true);
      }
    }
  });
});
