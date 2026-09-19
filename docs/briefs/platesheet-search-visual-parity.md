# PlateSheet search pane matches its artboards, element by element

Goal: the expanded search pane inside PlateSheet looks like `PlateSheetResults.dc.html` and its
sibling state artboards — every element, not just the four that `platesheet-search-spec-conformance.md`
named. The owner has reported this drift several times; earlier agents named issues and shipped
without fixing them, or fixed one property and never re-audited the rest. This brief is the full
audit (2026-09-19, code read against artboard inline styles) plus the states that had no artboard
until now. Owner-reviewed 2026-09-19: the new artboards and their copy ("Nothing found for <query>",
the error line) are approved; "the revised UI gives more relevant feedback to the user."

## Spec

UI (artboard → what it governs):
- `PlateSheetResults.dc.html` — results list, Load More, direct-lookup action, Create row, input row, back header
- `SearchExpandedHeader.dc.html` — back-header row + empty input (already partly conformant)
- `SearchStateInFlight.dc.html` — spinner row, disabled Search button, streamed rows (**new**)
- `SearchStateEmpty.dc.html` — "Nothing found for <query>" + direct-lookup + Create (**new**)
- `SearchStateError.dc.html` — gray error pill + Create (**new**)
- `SearchLookupStates.dc.html` — fetching / rate-limited rows (already conformant; do not regress)

Annotations: `search-state-actions` (new), `search-expanded-back-header`, `lookup-dish-states-logic`.
Read them; they carry the rationale. Never copy annotation text into the UI.

States (a screenshot per state, each compared side by side with its artboard): idle→expanded empty;
in flight (Search dimmed, spinner row, ≥1 streamed row); results with Load More + direct-lookup +
Create; results without Load More; empty ("Nothing found for <query>"); error; direct-lookup fetching;
direct-lookup rate-limited. Routes: `halls/franklin --stress <name>` — the fixtures for lookup-hit /
lookup-fetching / lookup-miss / lookup-rate-limited already exist in `halls/[slug].tsx`; **add dev-only
fixtures for in-flight, empty and error** (same mechanism, `__DEV__` only) so every state is
reproducible without live network.

Backend: none. Residency: none — pure client rendering, no new call, no new stored data.

Rationale: parity is judged per element against the artboard's inline style, mechanically
(`artboardStyle()` in `mobile/src/lib/artboard.ts`), not by eye. Rejected alternative: another
"conformance" pass scoped to whatever the owner last complained about — that is exactly how the
same pane has been reopened repeatedly.

## The audit (each row is an acceptance line below)

Artboard line numbers are `PlateSheetResults.dc.html`. Code refs are `mobile/src/components/PlateSheet.tsx`.

| # | Element | Artboard | Code today | Fix |
|---|---|---|---|---|
| 1 | Back chevron | :36 — 20×20 SVG, path `M15 5l-7 7 7 7`, stroke #3b0a0f 2px round; row gap 10, padding 2px 0 | `<Text>‹</Text>`, 32px glyph (`backChevron`) | render the SVG; `searchHeader` gap `spacing(2.5)` already right |
| 2 | Input box | :42 — padding 10/12, border `rgba(36,26,20,0.2)`, radius 6 | vertical `spacing(2)`=8, border ink900@25 | vertical `spacing(2.5)`, border @20 |
| 3 | Input text | :43 — 13px, #3b0a0f | `searchInput`: no fontSize, `colors.ink900` | `fs(13)`, `colors.maroon900` |
| 4 | Input row | :41 — `gap: 10px`, children **stretch** | `gap: spacing(2)`, `alignItems: "center"` | gap `spacing(2.5)`, `alignItems: "stretch"` |
| 5 | Search button | :45 — padding `0 18px`, fills the row height, Oswald 600 12px, #3b0a0f | `size="sm"` (4/8 padding), content-height | horizontal `spacing(4.5)`, vertical 0, stretched; disabled = 45% opacity (`SearchStateInFlight.dc.html:45`) |
| 6 | Result name | :53 — 13px / 600 | `fs(14)`, `fonts.body400` | `fs(13)`, `fonts.body600` |
| 7 | Result calories | :56 — mono 11px, ink @55% | `fs(13)`, ink @60% | `fs(11)`, @55% |
| 8 | Estimated-per-100g copy | Kind Bar row: `≈ 452 cal per 100g` | `N cal · est. per 100g` | `≈ N cal per 100g` |
| 9 | Row layout + dividers | rows `padding: 8px 2px`, 6px gap; 1px `rgba(36,26,20,0.08)` divider **between** rows, none after the last | `borderBottomWidth: hairline` @15 on every row incl. last | divider @8, between rows only; horizontal padding 2 |
| 10 | Load More | :104 — **full-width** block, centered, 1px border @20, radius 6, padding 10, marginTop 6, Oswald 600 12px/0.8 uppercase, ink @65 | `alignSelf: "center"`, `size="sm"` padding | full width, padding `spacing(2.5)` |
| 11 | Direct-lookup action | :106 — same geometry as Load More; border `rgba(124,36,48,0.45)`, text #7c2430 | bare ghost `<Button size="sm">` — **unstyled**, no artboard until now | new style mirroring #10 in maroon (`buttonColors("secondary")` colors) |
| 12 | Create-a-custom-food row | :108–110 — 18×18 SVG plus, stroke #7c2430 1.7 round | text `+` glyph | SVG |
| 13 | Scroll structure | header + input fixed; only the results list scrolls (`overflow-y: auto`, :50) | one `ScrollView` wraps back header, input **and** results; an `onFocus` `scrollToEnd` hack keeps the input visible | pin back header + input row outside the `ScrollView`; delete the `scrollToEnd` hack |
| 14 | In-flight indicator | `SearchStateInFlight.dc.html:49–51` — gold-tinted row (`lookupStateRowFetching` treatment) + "Searching…" | bare `<Spinner>` in `searchSpinner` | reuse `lookupStateRowFetching`, text "Searching…" |
| 15 | Empty state | `SearchStateEmpty.dc.html:47` — "Nothing found for <query>", 13px, ink @65, padding 8/2 | `"No matches."` (`searchHint`) | replace, interpolating the committed query |
| 16 | Error state | `SearchStateError.dc.html:44–50` — gray pill (`lookupStateRowRateLimited` treatment), alert glyph, copy "Couldn't search right now. Check your connection and try again." | raw red `#b00020` text `Search failed: <error string>` | replace; never render the raw error string |
| 17 | Footer visibility | annotation `search-state-actions` | direct-lookup already gated per `plate-search-semantics.md` decision 3 | unchanged — assert it in the new state tests |

## Acceptance

Every line needs **both** kinds of evidence unless stated: the mechanical test, then the screenshot.

- [ ] Rows 1–12 and 14–16: a test per row reads the value with `artboardStyle()` (cite the artboard
      copy string) and asserts the rendered component's style equals it — evidence: test. A row
      without its test is not done. Red first against current code, shown in the PR.
- [ ] Row 13: a test asserts the search input row is NOT a descendant of the results `ScrollView`,
      and that no `scrollToEnd` call is made on input focus — evidence: test
- [ ] Every state listed under Spec has a `screenshot.sh` capture (real Yoga layout, emulator pool)
      **beside its artboard** in the PR body, and the PR body lists, per numbered row, "matches" or
      the remaining delta with a reason. "Looks right" is not an entry — evidence: screenshot
- [ ] No explanatory captions were added anywhere (repo rule) — evidence: reviewer scan
- [ ] Existing behavior unchanged: search ordering, Load More reveal/fetch, direct-lookup gating,
      supersede-on-new-query, catalog live-splice fade-in (`plate-search-semantics.md`) — evidence:
      existing `PlateSheet.test.tsx` passes untouched except where a copy string changed
- [ ] The three new dev fixtures (in-flight, empty, error) are `__DEV__`-gated and documented in
      `screenshot.sh`'s header — evidence: test + review

## Tasks

1. Implement rows 1–17 in one pass — files: `mobile/src/components/PlateSheet.tsx`,
   `mobile/src/components/PlateSheet.test.tsx` (+ a new `PlateSheet.searchParity.test.tsx` if the
   file gets unwieldy), `mobile/src/app/halls/[slug].tsx` (dev fixtures), `mobile/scripts/screenshot.sh`
   (header only) — lanes: `cd mobile && npx tsc --noEmit`, `pnpm --filter mobile test`,
   `pnpm --filter mobile lint` — blocked by: none — PR:

One task, one PR, one worker: every row edits `PlateSheet.tsx`, so splitting only buys merge
conflicts (`plate-search-semantics.md` says the same about sequencing). Boot the emulator pool before
dispatch — nothing here can be verified without it. Fable/Opus escalation only if the worker fails
the screenshot comparison twice.
