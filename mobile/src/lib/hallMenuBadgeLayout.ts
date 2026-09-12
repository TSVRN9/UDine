/** Pure geometry helpers for halls/[slug].tsx's dish-row macro-badge tuck decision -- whether the
 * badge row fits beside a wrapped dish name's LAST line instead of always dropping to its own
 * line. Kept pure/testable (same style as hallMenuSections.ts's moveSectionToFront) since the
 * actual decision has to survive two independently-firing RN layout callbacks
 * (onLayout/onTextLayout) whose measurements land in the component as plain state. */

/** Width of N badges laid out in a row with `gap` between each -- N*badgeSize + (N-1)*gap, 0 for
 * N<=0. Takes badgeSize/gap as params (not hardcoded) so the caller derives them from the real
 * glyph-size/spacing constants instead of this file guessing at a duplicate literal. */
export function macroBadgeRowWidth(count: number, badgeSize: number, gap: number): number {
  if (count <= 0) return 0;
  return count * badgeSize + (count - 1) * gap;
}

/** True when the badge row fits in the trailing space after a wrapped name's last line, with a
 * full `gap` of slack on BOTH sides (not just >= badgeRowWidth) -- an absolutely-positioned
 * overlay has no flexWrap safety net if this call is wrong, and onTextLayout line-width metrics
 * have known cross-platform rounding differences (RN #36572/#36675), so this deliberately doesn't
 * cut it close. */
export function shouldTuckBadges({
  containerWidth,
  lastLineWidth,
  badgeRowWidth,
  gap,
}: {
  containerWidth: number;
  lastLineWidth: number;
  badgeRowWidth: number;
  gap: number;
}): boolean {
  return containerWidth - lastLineWidth - gap >= badgeRowWidth + gap;
}
