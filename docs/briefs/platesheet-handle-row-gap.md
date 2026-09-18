# PlateSheet: handle-to-title gap doesn't match the idle-state artboard

Goal: the gap between the drag handle and "Your Plate" matches `PlateExpanded.dc.html`'s panel
rhythm (14px), not a hardcoded value calibrated to something else.

## Spec

UI: `PlateExpanded.dc.html`
Annotations: none.
States: PlateSheet open, idle (not search-expanded) — the handle-to-title gap is the same in both
idle and expanded states today (it's above the point where the two states diverge), but the
correct value is idle's own (`PlateExpanded.dc.html`'s panel `gap: 14px`).
Routes: `halls/franklin` — open the plate bar.

Backend: none.
Residency: none.

Rationale: found by `pr-reviewer` 2026-09-18 while reviewing PR #515 (`platesheet-search-panel-
spacing-gap.md`), same class of bug as that PR but on a different row, out of its scope. `handleRow`
(`mobile/src/components/PlateSheet.tsx`)'s `marginBottom` is a fixed `spacing(2.5)` (10px) in both
states, but `PlateExpanded.dc.html`'s own panel `gap` is 14px. Use `artboardPanelGap()`
(`mobile/src/lib/artboard.ts`, added in #515) to read the correct value instead of hand-copying a
number.

## Acceptance

- [ ] Handle-to-"Your Plate" gap matches `PlateExpanded.dc.html`'s panel gap (14px) — evidence: test
      (via `artboardPanelGap()`, not a copied literal) + screenshot, measured with
      `mobile/scripts/measure-alignment.py --gap-between` on-device, not eyeballed

## Tasks

1. Fix `handleRow`'s `marginBottom` to match `artboardPanelGap("PlateExpanded.dc.html")`, add a test.
   — files: `mobile/src/components/PlateSheet.tsx`, `mobile/src/components/PlateSheet.test.tsx` —
   lanes: `cd mobile && npx tsc --noEmit`, `pnpm --filter mobile test`, `pnpm --filter mobile lint`
   — blocked by: PR #515 merging first (adds `artboardPanelGap()`) — PR:
