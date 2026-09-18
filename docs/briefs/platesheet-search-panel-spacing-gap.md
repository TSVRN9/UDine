# PlateSheet expanded search: gaps and padding don't match SearchExpandedHeader.dc.html

Goal: the vertical rhythm between "Your Plate", the "SEARCH" header row, and the search input row
matches the artboard's uniform 10px gap, and the expanded search block carries no padding of its
own beyond the panel's own padding — not the ~28px gap and extra box padding it has today.

## Spec

UI: `SearchExpandedHeader.dc.html`
Annotations: none.
States: PlateSheet search-expanded, no query typed yet (same state the header-parity brief already
covers).
Routes: `halls/worcester --stress lookup-hit --record-nav` (same route used for #513/#514's search
evidence).

Backend: none.
Residency: none.

Rationale: found 2026-09-18 by the owner looking at the merged result live on-device, right after
#513 (which fixed the border/header-row gaps) and #514 merged. Confirmed by reading the artboard
directly against current code:

1. **Panel gap is 14px where the artboard specifies 10px, and it's double-applied.**
   `SearchExpandedHeader.dc.html`'s panel is `display:flex; flex-direction:column; gap:10px` — a
   uniform 10px between every direct child (handle, title row, "SEARCH" header row, input row).
   `PlateSheet.tsx`'s `header` style has `marginBottom: spacing(3.5)` (14px) — correct for
   `PlateExpanded.dc.html`'s own idle-state panel gap (which really is 14px, a different artboard
   with a different spec), but wrong for the expanded/search state's own artboard. On top of that,
   `addSection` (the block containing the search header + input) *also* sets
   `marginTop: spacing(3.5)` (14px). React Native's Yoga layout does not collapse adjacent margins
   the way CSS block layout does, so `header`'s `marginBottom` and `addSection`'s `marginTop` add:
   14 + 14 = 28px between "Your Plate" and "SEARCH", nearly 3x the artboard's 10px.
2. **`addSection` still carries its own padding in the expanded state, which the artboard doesn't
   want there.** `addSection`'s `paddingVertical: spacing(3)` / `paddingHorizontal: spacing(3.5)`
   (12px/14px) is correct for the **idle** "Add something else" affordance (a bordered pill per
   `PlateExpanded.dc.html:87-93`, which does need its own box padding) but wrong for the
   **expanded** state: `SearchExpandedHeader.dc.html` has no wrapping box around its header/input
   rows at all — they sit directly in the panel's own `padding: 10px 20px 24px 20px`, with nothing
   extra layered on top.

This is the same root cause as the border bug #513 already fixed, recurring for a different
property: `addSection` is dual-purposed between the idle pill and the expanded wrapper, and each
pass so far has fixed the one property a report named (first the border, now the margin/padding)
without checking the rest of what the shared style applies. See "Root cause: why review didn't
catch this" below for what should change about the process, not just the code, so a third property
doesn't repeat this same pattern.

Rejected alternative: only fix the 14→10px `header` margin and leave `addSection`'s stacked
`marginTop` as a second, separate contributor — rejected because both changes are needed to reach
10px total, and leaving one in place would still produce a visibly-wrong (just smaller) gap.

## Root cause: why review didn't catch this

`PlateSheet.test.tsx`'s existing artboard-parity tests (from #513's REWORK round) assert individual
matched-element styles — the search-header row's own internal `gap` (chevron-to-title spacing), the
button's fill/typography, the icon's presence — each keyed to one specific piece of text via
`artboardStyle()`/`artboardEnclosingStyle()`. **Nothing tests the panel's own between-sibling
rhythm** (the vertical gap from one direct child of the panel to the next), because there's no
existing helper or established test pattern in this codebase for "assert the spacing between two
sibling rows matches the artboard's panel-level `gap`." That's a real, structural test-coverage
gap, not just a missed assertion — the same class of gap that let the border bug ship first. Whoever
fixes this should add that missing coverage as part of the fix (see Acceptance), and it's worth
noting for future artboard-parity test-writing generally: when a shared/dual-purpose style is
touched for one property, audit every property it sets against **both** artboards it's dual-purposed
for, not just the one named in the report.

## Acceptance

- [ ] Gap between "Your Plate"/context-label row and the "SEARCH" header row is 10px (`spacing(2.5)`),
      matching `SearchExpandedHeader.dc.html`'s panel `gap` — evidence: test + screenshot
- [ ] Gap between the "SEARCH" header row and the search input row is likewise 10px, not stacked
      margins from two different styles — evidence: test + screenshot
- [ ] The expanded search block has no padding of its own (content sits directly in the panel's own
      padding) — evidence: test (style assertion) + screenshot
- [ ] The idle "Add something else" affordance's own box padding/border (`PlateExpanded.dc.html:87-93`)
      is unchanged — evidence: existing tests (`#409` border test and any idle-state screenshot)
      still pass
- [ ] A new test asserts the panel-level gap between sibling rows in the expanded state, not just
      each row's own internal styling — evidence: test file diff, and state in the PR body which
      other `addSection`-adjacent properties were audited against both artboards while in there

## Tasks

1. Split the expanded-state spacing out of `addSection` (parallel to how #513 already split the
   border into `addSectionIdle`), fix `header`'s margin to be state-aware or move the correct 10px
   gap onto the expanded panel's own container, and add the missing panel-gap test coverage. —
   files: `mobile/src/components/PlateSheet.tsx`, `mobile/src/components/PlateSheet.test.tsx` —
   lanes: `cd mobile && npx tsc --noEmit`, `pnpm --filter mobile test`, `pnpm --filter mobile lint`
   — blocked by: none — PR:
