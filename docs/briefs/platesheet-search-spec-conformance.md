# PlateSheet expanded search matches its artboards

Goal: the food-search panel inside "Your Plate" (PlateSheet) visually matches its spec once
expanded — magnifying-glass icon in the input, a solid Search button, no stray border wrapping
the whole panel, and a properly-placed back affordance — instead of four small implementation
drifts that accumulated independently of the artboards.

## Spec

UI: `docs/design/PlateSheetResults.dc.html` (input icon, Search button fill, no outer border),
`docs/design/PlateExpanded.dc.html` (idle affordance row, unaffected by this brief),
`docs/design/SearchExpandedHeader.dc.html` (new — the back-header row; no prior artboard covered
the idle↔expanded transition itself, so this one was drafted fresh this session).
Annotations: `search-expanded-back-header` (canvas.json) — explains why the header row reuses
`CustomFoodForm.tsx`'s existing chevron+title convention instead of inventing new visual
language.
States: idle "Add something else" row (already correct, do not touch), expanded with empty
query, expanded with results, expanded during a lookup-dish fetch (spinner row) — all four must
show the corrected header/icon/button/no-border treatment, since they share the same
`addSection`/`searchRow` markup.
Routes: `halls/worcester --stress ""` then tap the plate bar + "Add something else" for idle→
empty-expanded; `halls/worcester --stress lookup-hit --record 2` for the results state;
`halls/worcester --stress lookup-fetching` for the in-flight spinner state.

Backend: none.
Residency: none — pure client-side rendering fix, no new client→Supabase call, no new stored
data.
Rationale: four independent drifts, each traced to its exact cause by reading the current code
against the artboards side by side (not assumed):

1. **Missing magnifying-glass icon** — `PlateSheet.tsx`'s expanded `TextInput` (~line 609) never
   had the icon `PlateSheetResults.dc.html:37` specs; the idle row's own icon (~line 826,
   correctly present, comment cites `PlateExpanded.dc.html:87`) was never carried over when the
   row expands into the actual search input.
2. **Wrong Search button variant** — `<Button variant="secondary" ...>` (~line 623) renders
   transparent-background/outlined (`buttonColors`, `mobile/src/lib/theme.ts:121-122`), not the
   solid maroon fill `PlateSheetResults.dc.html:40` specs. `variant="primary"`
   (`buttonColors`, `theme.ts:119-120`: `backgroundColor: colors.maroon600, color:
   colors.paper50`) is the already-existing variant that matches — same one the sheet's own LOG
   button already uses (~line 815). No new variant needed.
3. **Extraneous wrapping border** — `addSection` (styles, ~line 918) is shared between the idle
   affordance row and the expanded search panel (~line 604, used bare) by design, per its own
   comment (~line 913-916) — but that comment's assumption ("base border is the expanded state's
   plain solid one") is simply wrong against the artboard: `PlateSheetResults.dc.html` has no
   border around the expanded panel at all, only around the input box itself (`:36`). The dashed
   idle-only border was correctly split out into `addSectionIdle` (~line 928); the *solid* border
   in the shared base `addSection` was never split out because nobody re-checked it against the
   artboard when the split was made.
4. **Back chevron placed and styled inconsistently** — no artboard depicts the idle↔expanded
   transition itself (confirmed: neither `PlateExpanded.dc.html` nor `PlateSheetResults.dc.html`
   show it), so this one isn't a spec-drift, it's new territory. But the app already has an
   established convention for this exact `backChevron` style token — `CustomFoodForm.tsx`
   (~line 88-92) and `SearchResultDetail.dc.html` (:18-21) both pair it with a title inside a
   proper header row (`flexDirection: row, alignItems: center`, consistent gap). PlateSheet's
   version (~line 605-607) drops the bare `Pressable`/`Text` in alone, outside any such row —
   this brief applies the same established pattern here instead of designing something new,
   per the fresh `SearchExpandedHeader.dc.html` mockup and its annotation.

Rejected alternative (item 3): keep a border on the expanded panel too, since it's a harmless
visual choice not strictly "wrong" on its own. Rejected because the artboard is unambiguous
(no border), and the existing code comment's own justification for keeping it turns out to be
based on a wrong assumption, not a deliberate deviation — nothing about removing it conflicts
with anything else the sheet does.

## Acceptance

- [ ] Expanded search input shows the magnifying-glass icon, matching `PlateSheetResults.dc.html:37`
      — evidence: screenshot
- [ ] Search button renders solid maroon fill with light text (`variant="primary"`), matching
      `PlateSheetResults.dc.html:40` — evidence: screenshot
- [ ] No border wraps the expanded search panel (input row + results + footer); only the input
      box itself keeps its own border, matching `PlateSheetResults.dc.html` — evidence: screenshot
- [ ] Idle "Add something else" row is unaffected — still has its dashed border, icon, and hint
      text exactly as before — evidence: existing tests continue passing + screenshot
- [ ] Back chevron sits in a header row with a "Search" title, matching
      `SearchExpandedHeader.dc.html` and `CustomFoodForm.tsx`'s established chevron+title layout
      — evidence: screenshot
- [ ] All four hold across the empty, results, and fetching states (same shared markup) —
      evidence: screenshot per state (Routes above)

## Tasks

1. In `mobile/src/components/PlateSheet.tsx`:
   - Add the magnifying-glass `Svg`/`Circle`/`Path` (same markup as the idle row's icon, ~line
     826-829) inside the expanded `searchRow`, before/alongside the `TextInput`.
   - Change the Search button's `variant="secondary"` to `variant="primary"` (~line 623).
   - Split `addSection` (~line 918) so its base has no `borderWidth`/`borderColor` — move those
     into `addSectionIdle` (~line 928) alongside its existing dashed-border overrides, so the
     idle row keeps its dashed border and the expanded panel (which uses bare `addSection`, line
     604) gets none. Update the stale comment (~line 913-916) to reflect the artboard, not the
     old assumption.
   - Wrap the back chevron (~line 605-607) in a new header-row style (`flexDirection: row,
     alignItems: center`, spacing consistent with `CustomFoodForm.tsx`'s `header` style) paired
     with a "Search" title `Text`, per `SearchExpandedHeader.dc.html`.
   - Add/update component tests in `PlateSheet.test.tsx` covering: icon present when expanded,
     button variant is primary when expanded, `addSection` alone (expanded) has no border while
     `addSection`+`addSectionIdle` (idle) still does, header row renders the chevron + "Search"
     title. Red first against current code, green after.
   - Screenshot all three states per the Routes above and compare against the cited artboards.
   — files: `mobile/src/components/PlateSheet.tsx`, `mobile/src/components/PlateSheet.test.tsx`
   — lanes: `cd mobile && npx tsc --noEmit && npx jest && pnpm lint` — blocked by: none — PR:
