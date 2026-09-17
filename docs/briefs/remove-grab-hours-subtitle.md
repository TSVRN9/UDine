# Remove the Grab 'N Go tab's inline hours subtitle

Goal: selecting the Grab 'N Go tab no longer shifts the meal-tab row down by an inline
"open now · until X" / "closed · opens X" line. That information already lives in
`HallInfoSheet` (tap the hall title), matching how every other meal tab already works.

## Spec

UI: `docs/design/HallMenu.dc.html` (hall menu + plate bar) — header row is immediately followed
by the tab row for every tab, including Grab; no subtitle line exists in the artboard for any
tab.
Annotations: none.
States:
- Grab tab selected, today's date, retail hours present — no inline line renders, tab row does
  not shift relative to any other tab.
- Grab tab selected, date stepped off today (or hours otherwise absent) — same: no inline line,
  no shift. (This state already renders nothing today; the point is it stays that way alongside
  the "hours present" state instead of the two differing.)
- Breakfast/Lunch/Dinner/Late tabs — unaffected; they already have no inline line (issue #180).
Routes: `halls/worcester?meal=grab --record 2`

Backend: none.
Residency: none — pure client-side render fix, no new client→Supabase call, no new stored data.
Rationale: `mobile/src/app/halls/[slug].tsx` renders `grabSubtitle` (computed ~lines 1278-1279)
as a normal block-flow `Text` sibling between the header and `styles.tabRow` (~line 1657),
conditionally, only when the Grab tab is selected and hours are known. Because it's conditional
block-flow content rather than a fixed-height reserved slot, switching to/from Grab (or stepping
the date off today) shifts the tab row up or down — a real layout displacement. A comment at the
style definition (~line 2085) says this line was "ported from the retired grab-n-go/[slug].tsx",
a separate legacy screen's header grafted onto the current shared Hall Menu screen.

The equivalent subtitle for Breakfast/Lunch/Dinner ("being served now · until HH:MM") was already
deliberately removed for the same displacement reason under issue #180
(`mobile/src/lib/hallMenuTabs.ts:124-127`) — that information now lives only in `HallInfoSheet`.
`HallInfoSheet` already renders a Grab 'N Go hours row (`grabNGoWindow` prop, ~lines 101-104),
fed independently via `hallInfoGrabNGoWindow` (piped in around `[slug].tsx:1936`) — it shares no
state with the `grabSubtitle` computation being deleted, so it is structurally unaffected by this
change, not just assumed to be. Deleting the inline line for Grab therefore loses no information
and makes Grab consistent with the other four tabs.

Rejected alternative: reserve a fixed-height slot for the subtitle so it never shifts layout
regardless of content. Rejected because the artboard shows no such slot for any tab, and #180
already established the product decision that this information belongs in `HallInfoSheet`, not
inline in the header — reserving space for content that shouldn't be there at all would be
re-litigating a settled decision, not fixing the shift.

## Acceptance

- [ ] Selecting the Grab tab never renders an inline open/closed line, and the tab row's position
      does not shift when switching to/from Grab — evidence: test
- [ ] `mobile/src/lib/hallMenu.test.tsx`'s existing "shows the Grab tab's open/closed subtitle"
      test is inverted to assert the line never appears (both the "today" and "date-stepped"
      cases) — evidence: test (red against current code, green after the fix)
- [ ] `HallInfoSheet`'s Grab 'N Go hours row is unaffected — evidence: existing HallInfoSheet
      wiring unchanged (no test currently exists for this row; verify by reading the prop wiring
      is untouched)
- [ ] Screenshot of `halls/worcester?meal=grab` matches `HallMenu.dc.html` (no subtitle line,
      tab row in the same position as any other tab) — evidence: screenshot

## Tasks

1. In `mobile/src/app/halls/[slug].tsx`: delete the `grabSubtitle`/`grabRetailHours` computation
   (~lines 1278-1279) and its render site (~line 1657); delete the now-dead `headerSubtitle`
   style object (~lines 2085-2092) and its "ported from grab-n-go" comment; re-grep
   `retailHeaderSubtitle`, `retailOpenStatus`, and `findGrabNGoLocation` each for other live
   usage before trimming their imports (delete only what's now genuinely unused). Invert the
   test at `mobile/src/lib/hallMenu.test.tsx:731-748` first to get a red failure against current
   code, then make it pass. Screenshot `halls/worcester?meal=grab --record 2` against
   `HallMenu.dc.html`. — files: `mobile/src/app/halls/[slug].tsx`,
   `mobile/src/lib/hallMenu.test.tsx` — lanes:
   `cd mobile && npx tsc --noEmit && TZ=America/New_York npx jest && pnpm lint` — blocked by:
   none — PR:
