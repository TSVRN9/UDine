# PlateSheet: handle-to-title gap doesn't match the idle-state artboard

Goal: the gap between the drag handle and "Your Plate" matches `PlateExpanded.dc.html`'s panel
rhythm (14px), not a hardcoded value calibrated to something else.

## Spec

UI: `PlateExpanded.dc.html` (idle state), `SearchExpandedHeader.dc.html` (expanded/search state) —
**correction, 2026-09-18 round 1 REWORK**: an earlier version of this brief claimed the
handle-to-title gap sits "above the point where the two states diverge" and needs no state-aware
override. That's wrong, and both artboards this brief itself names disprove it:
`SearchExpandedHeader.dc.html:27`'s panel `gap: 10px` covers the *same* handle→title pair as
`PlateExpanded.dc.html:27`'s 14px — they're direct siblings in both artboards' panel flex column,
not two different rows. `handleRow`/`header` in the real component render unconditionally above the
`searchExpanded` branch (only `header`'s own `marginBottom` gets a `searchExpanded` override via
`headerExpanded` — `handleRow`'s does not), so a single hardcoded `handleRow.marginBottom` cannot be
correct for both states at once, the same "dual-purpose style, one property fixed at a time" pattern
#513/#515 already hit twice.
Annotations: none.
States: PlateSheet open, both idle (10px→14px fix) **and** search-expanded (must independently read
10px from `SearchExpandedHeader.dc.html`, not silently inherit whatever idle's fix leaves behind).
Routes: `halls/franklin` — open the plate bar for idle; tap "Add something else" for expanded.

Backend: none.
Residency: none.

Rationale: found by `pr-reviewer` 2026-09-18 while reviewing PR #515 (`platesheet-search-panel-
spacing-gap.md`), same class of bug as that PR but on a different row, out of its scope. `handleRow`
(`mobile/src/components/PlateSheet.tsx`)'s `marginBottom` is a fixed `spacing(2.5)` (10px) in both
states — wrong for idle (should be 14px) and, per the correction above, also needs its own
`searchExpanded`-gated override for the expanded state (10px, same value it already accidentally
had — don't let "it happens to render the same number today" hide that it's currently unconditional,
not state-aware). Use `artboardPanelGap()` (`mobile/src/lib/artboard.ts`, added in #515) to read
both values instead of hand-copying numbers.

## Acceptance

- [ ] Idle-state handle-to-"Your Plate" gap matches `PlateExpanded.dc.html`'s panel gap (14px) —
      evidence: test (via `artboardPanelGap()`, not a copied literal) + screenshot, measured with
      `mobile/scripts/measure-alignment.py --gap-between` on-device, not eyeballed
- [ ] Expanded-state handle-to-"Your Plate" gap independently matches
      `SearchExpandedHeader.dc.html`'s panel gap (10px) via its own state-aware override (mirroring
      `header`/`headerExpanded`), not left as an unconditional value that happens to still read
      correctly — evidence: test (via `artboardPanelGap()`) + screenshot

## Tasks

1. Fix `handleRow`'s `marginBottom` to match `artboardPanelGap("PlateExpanded.dc.html")`, add a test.
   — files: `mobile/src/components/PlateSheet.tsx`, `mobile/src/components/PlateSheet.test.tsx` —
   lanes: `cd mobile && npx tsc --noEmit`, `pnpm --filter mobile test`, `pnpm --filter mobile lint`
   — blocked by: PR #515 merging first (adds `artboardPanelGap()`) — PR:
