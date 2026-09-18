# Hall menu: badge-tuck stress fixture can't test the tuck/untuck boundary

Goal: a future claim of "verified the macro-badge tuck decision on-device" is actually checkable —
today it isn't, and four merged PRs made that claim on a fixture that can't back it.

## Spec

UI: none new — `mobile/src/app/halls/[slug].tsx`'s existing `stressFixtureItems` (`--stress
long-names`).
Annotations: none.
States: a dish row whose wrapped last line sits near, not deep inside, the real tuck/untuck
threshold (`lastLineWidth <= containerWidth - 2*NAME_BADGE_GAP - badgeRowWidth(n)`,
`mobile/src/lib/hallMenuBadgeLayout.ts`), at each reachable badge count (1-4 — see below).
Routes: `halls/franklin --stress <new fixture key> --record-nav`.

Backend: none.
Residency: none.

Rationale: measured on-device 2026-09-17 (`docs/briefs/hall-menu-filter-overlap.md`'s task 1, both
passes): `stressFixtureItems`'s two dish names have last lines of 94.97dp and 56.96dp, which tuck at
every reachable macro-badge count (1-4) on a 229dp container — nowhere near the real boundary. Every
PR that cited this fixture as on-device verification of the tuck decision (#449, #452, #454, #455)
therefore verified nothing about it; same failure class as `synthetic-input-tests-are-not-device-
verification` (a check that looks like device evidence but exercises the wrong thing). Also
confirmed: the achievable badge ceiling is 4, not 5 — `menuItemMacroBadges` (`shared/src/types.ts:193`)
suppresses `high-fiber` whenever `high-protein` also qualifies, so `[slug].tsx:167`'s fixture comment
claiming a 5-badge "must-stack" case is wrong.
Rejected alternative: reuse the throwaway fixture built during that investigation
(`lastLineWidth=143.24dp`, tuned to fail the n=4 threshold by 0.24dp) — rejected as the permanent
fixture because it's tuned to this exact device/font at a hair's-width margin; a font metric or
device change could silently flip which side of the boundary it lands on and this would return to
verifying nothing without anyone noticing. A committed fixture needs enough margin to survive that,
while still being demonstrably on the tuck side for n-1 and the untuck side for n.

## Acceptance

- [ ] A committed stress fixture (a new `--stress` key or an addition to `long-names`) has a
      measured `lastLineWidth` that tucks at some badge count `n-1` and untucks at `n`, for at least
      one reachable `n` in 1-4 — evidence: `node --test` (see next line) + screenshot
- [ ] `hallMenuBadgeLayout.test.ts` (new or existing) pins the threshold math itself
      (`shouldTuckBadges`/`macroBadgeRowWidth`) with explicit boundary cases — the exact numbers this
      pass measured (thresholds 200/181/162/143dp at 229dp container width, `NAME_BADGE_GAP`/
      `MACRO_BADGE_GAP`/`MACRO_BADGE_SIZE` as of 2026-09-17) are a reference, not a source of truth —
      test the functions' logic, not device-specific pixel values — evidence: test
- [ ] Fixture has enough margin from the boundary to not flip sides on a small font-metric change
      (a comment stating the margin and why it's enough is suffices — no runtime tolerance needed)

## Tasks

1. Add the fixture + threshold-math tests. — files: `mobile/src/app/halls/[slug].tsx`,
   `mobile/src/lib/hallMenuBadgeLayout.ts` (or a new `hallMenuBadgeLayout.test.ts`) — lanes:
   `pnpm --filter mobile test`, `cd mobile && npx tsc --noEmit` — blocked by: none — PR:
