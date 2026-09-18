# Hall menu: overlapping elements when adding/removing filters

Goal: the original report, verbatim, is "there are still issues with overlapping elements in the
menu view when adding/removing filters" — no filter type, dish, or element was named. Everything
below investigated one specific guess (macro-badge tuck in `DishRow`) at two people's initiative,
not from the report itself, and that guess did not pan out. **This brief does not yet describe the
user's actual bug** — see "Status" below before reading the rest as a closed investigation.

## Status (2026-09-17)

Two on-device passes ruled out macro-badge tuck as a cause (see Rationale) — that hypothesis came
from reading `DishRow`'s code, not from the report, and its ruling-out doesn't mean the report is
wrong or resolved. **Owner confirmed: the station filter** (not macro presets, not price). That
rules FAB-badge and `listBottomPadding`-vs-clearance out as the leading candidates (neither is
specific to station filtering) — revisit only if the below also clears. It points at two things,
both read from the code, **neither yet seen in a frame — treat as leading candidates, not a
confirmed mechanism**, same discipline that the macro-badge chase needed and didn't get until the
second pass:

- **Missing `exiting` animation on removed rows/section headers.** `DishRow`
  (`mobile/src/app/halls/[slug].tsx:527`) and both `renderSectionHeader` wrappers (`:1521-1525`,
  `:1576-1580`) animate surviving cells with `Reanimated.View layout={LinearTransition.duration(
  durations.rowLayout)}` but have **no `exiting` prop** — a row/section that a station toggle
  filters out vanishes instantly (plain unmount) while siblings above/below it are still mid-tween
  sliding into their new position over that same 180ms. `GestureSectionList` (`:123-126`) is
  unmodified stock `SectionList` wrapped only for gesture arbitration — its `VirtualizedList` cell
  recycling recomputes offsets synchronously and has zero coordination with the Reanimated
  transforms, so a freshly recycled cell can render its new content immediately at a slot a
  surviving row's `LinearTransition` is still animating through. A station toggle can empty whole
  categories at once (unlike a single macro-preset change), which is exactly the multi-row-vanish
  shape this mismatch needs to be visible.
- **`StationScrubber`'s `activeStationIndex` isn't reset on filter change** — only on `[selectedMeal]`
  (`mobile/src/app/halls/[slug].tsx:1155-1156`). Toggling a station filter can shrink
  `activeStationSections` (`:1138-1142`) immediately while `activeStationIndex` still holds an index
  computed against the previous, longer array until `onViewableItemsChanged` next fires — that stale
  index feeds a `withTiming` animation (`durations.stationHighlight`, `StationScrubber.tsx:59,68-70`)
  toward a position keyed to `sections.length`, which could put the scrubber's highlight segment at
  the wrong offset for one tween cycle. Independent bug from the first candidate, same triggering
  action (station filter toggle) and same reported symptom class — see Tasks.

A real, separate finding did come out of the macro-badge investigation — see
`docs/briefs/hall-menu-badge-tuck-fixture-gap.md` (split out so it doesn't get lost in this brief's
"no bug found" ending): the `--stress long-names` fixture can't test the tuck/untuck boundary, so
past PRs claiming on-device verification of it verified nothing.

## Status (2026-09-18, third pass — task 2 ruled out, task 3 confirmed and fixed)

Root-caused both station-filter candidates named in the 2026-09-17 Status above, on-device, before
writing any fix, per Tasks below.

**Task 2 (missing `exiting` on removed rows/headers) — RULED OUT, same discipline as the
macro-badge chase.** Structural reason, verified against the actual `@react-native/virtualized-lists`
source in this repo's own dependency tree (not assumed from RN docs): `VirtualizedSectionList`'s
`_subExtractor` builds each rendered cell's React `key` as `` `${section.key ?? sectionIndex}:${itemKeyExtractor(item, itemIndexWithinSection)}` ``, and that key is set directly as `key={key}` on the
`CellRenderer` VirtualizedList mounts (`VirtualizedList.js:833`). This screen's own
`keyExtractor={(item, index) => \`${item.category}-${item.dishName}-${index}\`}` (`:1505`, `:1569`)
bakes the item's *position within its section* into the key, and `MenuSection` carries no explicit
`.key` (`hallMenuSections.ts`), so the section falls back to its *position within `sections`*
(`String(i)`). Removing a whole station empties a section, so every *later* section's index — and
therefore every one of its rows' and its header's key — shifts. A shifted key is not the same React
element across renders; React unmounts the old key and mounts a new one. `Reanimated.View`'s
`layout={LinearTransition...}` only animates a component instance that *persists* across a render
(the same element re-laying-out); a remount has no previous frame to tween from, so it just paints
at its final position instantly. There is therefore no "surviving row/header still mid-tween"
state for a recycled cell to ever overlap — not for any dish name, badge count, or toggle speed;
this is a property of the key scheme, not of timing. Removing a row *within* a surviving section
shifts that section's own later rows' keys the same way, same conclusion.

Confirmed on real Franklin lunch data (not a synthetic fixture, per the task): selected Grill
Station + Pasta Bar (skipping Stir Fry Station, which was already selected) via the real
`FilterSheet`, `adb shell screenrecord` running across the toggle and the `Done` tap. The
settled result is clean (`GRILL STATION` header directly followed by `PASTA BAR`, no residue, no
overlap) — but **that recording, and the earlier ones from this pass, only ever show the
POST-reveal settled state, never the transition itself**: the only UI that can change
`stationFilter` is `FilterSheet`, a full-screen opaque sheet, and the underlying `SectionList`
keeps receiving layout callbacks and re-rendering while occluded (`VirtualizedList._onCellLayout`
calls `_updateViewableItems` on every cell layout regardless of visibility), so by the time the
sheet's close animation reveals the list, any transition has already completed behind it. Do not
describe this as "the frames show zero overlap during the transition" — they don't show the
transition at all, because the sheet makes it structurally unobservable. The load-bearing evidence
is the key-scheme argument above; the device pass corroborates the settled result and rules out a
separate visible-residue possibility, nothing more. (Note for whoever reopens this: PRs
#449/#452/#454/#455 each claimed on-device verification of a *different* file's tuck decision via a
fixture later shown not to cross the real boundary — see `hall-menu-badge-tuck-fixture-gap.md`. This
pass's overclaim risk is different — mistaking "occluded" for "verified" — flagged here so it
doesn't repeat either way.)

Two more findings, both provable from the code with no device needed:
- The brief's second bullet ("toggling a station filter that only thins rows within surviving
  sections, no category fully empties") describes a shape a pure station-filter toggle cannot
  produce: `sectionsForPeriod` groups items by `normalizeStationName(item.category)`
  (`hallMenuSections.ts`) and `itemMatchesStationAndPriceFilter` tests
  `stationFilter.has(normalizeStationName(item.category))` (`FilterSheet.tsx`) — the exact same key.
  A station toggle is all-or-nothing per section by construction; it can never leave a section
  non-empty but thinned. (A combined station+price toggle, or an allergen/diet-tag toggle
  alongside a station toggle, CAN thin a surviving section — untested this pass, since the
  acceptance criteria named a station filter specifically.)
- One real anomaly turned up and was set aside rather than chased (out of this task's scope, but
  worth the next pass starting from evidence instead of a code read): after filtering down to a
  single station from a deep scroll position, the revealed list kept its *absolute scroll offset*
  from before filtering rather than resetting to the top — preserved at
  `docs/briefs/hall-menu-filter-overlap-evidence/scroll-offset-preserved-after-station-filter.png`
  (this pass's own frame, pulled out of the scratchpad before cleanup) shows the list settled
  mid-scroll ("French Fries" et al, no section header visible) immediately after a Grill-Station-only
  filter was applied from a position scrolled well past it. A preserved offset into a much shorter
  filtered list is a plausible shape for "overlapping/wrong-looking elements" reports (a stale
  scroll position landing on unrelated content, or the plate bar/FAB clearance math running against
  the wrong effective list length).

**This is now the leading candidate, for a structural reason beyond just being untested: it's the
only one of the three that can survive `FilterSheet`'s occlusion.** All three candidates this brief
has chased (macro-badge tuck, missing `exiting` animation, scrubber stale-index) are *transitions* —
things that happen during the moment a filter toggle takes effect. But the only UI that can change
`stationFilter` is `FilterSheet`, a full-screen opaque sheet, and the underlying `SectionList` keeps
receiving layout callbacks and self-correcting *while occluded* (confirmed both this pass and the
prior one) — so by the time the sheet's close animation reveals the list, any such transition has
already finished behind it. No filter-toggle-triggered transient can be what the user saw, full
stop; three passes chasing transition-timing mechanisms were chasing something structurally
unobservable. What *can* survive occlusion and be visible on reveal is **wrong settled state** — and
a preserved scroll offset into a shorter list is exactly that shape. Next pass should root-cause this
from the evidence above, not from a code read: no custom fixture, no transition capture, no timing
work, just "does the list correctly reset scroll position (or otherwise render correctly) after a
station filter changes what's visible."

**Task 3 (`StationScrubber`'s `activeStationIndex` not resetting) — CONFIRMED and FIXED, but not
via the trigger the brief named.** Toggling a station filter through `FilterSheet` does NOT surface
this bug either, for the identical occlusion reason as task 2: the still-mounted list's own cell
layout keeps calling `onViewableItemsChanged` while hidden, correcting `activeStationIndex` before
the sheet ever reveals it (confirmed on-device: scrolled deep, filtered from ~18 stations down to
1 — below `StationScrubber`'s own `count <= 1` unmount guard, so no highlight to even check — then
re-tested with a 3-station filter from a deep scroll; the highlight was already correct at every
frame the reveal exposed).

The real reproducer is the **date-step arrows**, which don't occlude anything: `sectionsByPeriod`
(and therefore `activeStationSections`) is fully rebuilt from the new day's `items`, but
`activeStationIndex`'s reset effect only watched `[selectedMeal]`. Confirmed on-device (Franklin,
real next-day fetch, `adb shell screenrecord` across the step): scrolled to the last section
(`DESSERTS`) on Sep 17, stepped to Sep 18 — the new day's list settled at its own first section
(`GRILL STATION`, scrolled to top) while the scrubber highlight rendered stuck near the *bottom* of
the track. **This is not a one-frame blip**: a follow-up screenshot taken ~12s later, with zero
further interaction, still showed the same wrong position — because nothing re-fires viewability
for a settled, unscrolled list, unlike the still-mounted-behind-a-sheet filter case. This is a
real, persistent, user-visible defect.

Fix (`mobile/src/app/halls/[slug].tsx`): widened the existing reset effect's dependency array from
`[selectedMeal]` to `[selectedMeal, activeStationSections]` — `activeStationSections` already
changes for every one of the reasons this bug can occur (date step, station/price filter,
allergen/diet-tag filter), so one dependency covers all of them, not just the date-step path this
pass could actually drive to a visible frame. This is NOT the "add `stationFilter`/`priceFilter` to
the deps" fix the brief originally proposed — that would have covered only 2 of the (at least) 3
reshape paths, and per the occlusion finding above, the 2 it covers were never the ones that reach
a visible frame anyway. Confirmed the fix on-device (same repro: highlight lands at the top segment
immediately, matching the new day's actual top section) and with a new regression test
(`mobile/src/lib/hallMenu.test.tsx`, red without the fix — `StationScrubber`'s `activeStationIndex`
prop stayed 1 after a date step that should have reset it to 0, per `git stash` verification during
this pass).

## Status (2026-09-18, real reproduction from the owner — the harness gap task 4 hit no longer blocks)

Owner supplied three real on-device screenshots (not a synthetic capture), reproducing what reads as
the same defect class task 4 root-caused but couldn't get a clean fix-confirmation for. Saved:
`hall-menu-filter-overlap-evidence/vegetarian-on-hampshire-dinner-gaps-clipped-rows.png`,
`vegetarian-on-franklin-lunch-gaps.png`, `vegetarian-off-franklin-lunch-gaps.png`. Trigger: toggling
the **vegetarian diet-tag filter** on Hampshire/dinner and Franklin/lunch — both turning it on (first
two images) and turning it back off (third image) reproduce it; owner reports it's intermittent, not
every toggle.

**Two distinct visual shapes across the three frames, both consistent with task 4's own root-cause
theory** (a filter reshapes `periodSections`/`grabSectionsMemo` in place, `GestureSectionList` never
unmounts, and nothing resets the still-mounted list's native scroll offset for the new, shorter
shape):
- **Large blank vertical gaps** between otherwise-normal rows (all three images) — consistent with
  the list's own scroll-position/content-height bookkeeping disagreeing with the newly reshaped
  section data.
- **A row's top clipped off, showing only its nutrition line with the dish name missing** (image 1,
  twice: the row above "Korean BBQ Chicken", and the row above "Stir Fried Vegetables w/Sesame") —
  this is a materially more specific shape than anything the first four passes captured, and reads
  like the viewport landing mid-cell rather than at a cell boundary, which a stale absolute scroll
  offset applied against a reshaped (different total height) list would produce.

This is the first evidence tying the reported symptom to a **diet-tag filter** specifically — task
1's Rationale explicitly flagged "an allergen/diet-tag toggle alongside a station toggle CAN thin a
surviving section — untested this pass" as a case a pure station toggle can't produce but a diet-tag
toggle plausibly can, and task 4's own branch (pushed, not merged: `fix/hall-menu-scroll-offset`,
`ca7cad4`) was built and tested only against station/price filters. **This does not by itself confirm
task 4's pushed fix is correct or sufficient** — it wasn't written or tested against a diet-tag
toggle — but it hands whoever picks this up next a concrete, real, repeatable-enough trigger to aim
a device pass at, which is exactly what task 4 said it lacked ("the pass's on-device harness was
unreliable this round... a real fix could be failing, or the harness could be lying. Not
distinguished yet"). Recommended next step: task 5 below, dispatched as a `heavy-debugger` job (two
prior fix attempts on this general defect class already went unconfirmed or unmerged) with this new
evidence and trigger as the starting point, rather than another blind on-device sweep.

## Spec (current scope: the scroll-offset candidate — see 2026-09-18 Status above)

UI: `FilterSheet.dc.html` (chip sheet, unchanged; not implicated — the sheet's own occlusion is why
every filter-toggle-*transition* candidate this brief tried turned out unobservable, see Status). No
artboard covers the hall-menu list's scroll-position behavior across a filter change.
Annotations: none.
States: scrolled well past a station's section → filter down to that one station (or otherwise
shrink the visible list) via `FilterSheet` → observe where the revealed list is scrolled to and
whether anything renders wrong/overlapping at that position. Compare against scrolled-to-top-already
and not-scrolled-past-the-filtered-content baselines.
Routes: `halls/franklin` (real data, no stress fixture needed — any hall with enough stations to
scroll past works) — scroll deep, open the filter FAB, select a single station in `FilterSheet` that
appears early in the list, tap Done, `--record-nav` or a screenshot immediately on reveal.

Backend: none.
Residency: none — device-rendered layout only, no data crosses to the server.

**Superseded, kept for history — the three transition-timing candidates this brief chased before
reframing around occlusion (all read from `DishRow`/`hallMenuBadgeLayout.ts`/`StationScrubber`
code, all ruled out or redirected — full detail in the Rationale/Status sections below):** macro-
badge tuck reflow, missing `exiting` animation on removed rows/section headers, and
`StationScrubber`'s stale `activeStationIndex` (this one real, but only reachable via the date-step
arrows, not a filter toggle — fixed in PR #511). None of the states/routes originally listed here
for those candidates (macro-badge boundary fixtures, `--stress long-names`) apply to the current
scope; see `docs/briefs/hall-menu-badge-tuck-fixture-gap.md` for the one piece of that work still
worth doing independently.

Rationale: `DishRow` (`mobile/src/app/halls/[slug].tsx` lines 425-562) decides whether macro badges
tuck beside a wrapped dish name's last line, or drop inline, via `shouldTuckBadges`
(`mobile/src/lib/hallMenuBadgeLayout.ts`), fed by `onLayout`/`onTextLayout` measurements that are
taken from the *current* rendered layout — untucked badges sit in-flow next to the name
(`rowNameLine: { flexDirection: "row", flexWrap: "wrap" }`, `rowText: { flexShrink: 1 }`, line
2184-85), so their width constrains the text and is baked into `lastLine`. The moment that
measurement flips the tuck decision, the badge row leaves flow (`macroBadgeRowTucked: { position:
"absolute" }`, line 2191), the text regains the width the badges had been taking, and can reflow —
but the overlay is still positioned from the pre-reflow `lastLine`. The measurement that drives the
decision isn't valid once the decision changes what's being measured. A filter toggle (changing
`badgeRowWidth`, line 512) is one way to push the decision across that edge; this needs root-causing
on-device (task 1) before deciding exactly where the loop breaks, rather than committing to a fix
here — seeing a plausible mechanism from reading the code is not the same as having reproduced it.

**2026-09-17 on-device update (task 1, first pass):** tested live with an unbreakable-last-word
fixture (a single 40-char run with no spaces) straddling the n=3/n=4 tuck boundary. `tucked` flipped
true→false cleanly on the 4th badge with no oscillation across many re-renders, and the badge row
dropped to its own line with **no overlap and `lastLineWidth` unchanged before/after** — because an
unbreakable last line has no room to share a line with anything, untucking it can't make the text
reflow. This mechanism is ruled OUT for that case; it narrows to whether a *breakable* multi-word
last line (which genuinely can re-wrap once badges leave flow, per `rowText: { flexShrink: 1 }`)
behaves differently. That's still unconfirmed — see Tasks. Separately: `uiautomator dump` returned
`could not get idle state` on 6/6 attempts against a live `halls/franklin` route during this pass,
where a prior investigation (PR #460, 2026-09-13) found the same route's accessibility tree healthy.
Two 1s-apart screencaps were pixel-identical, but that doesn't rule out a view-tree that's churning
without a visible repaint — exactly what a measure/remeasure layout loop would produce. Task 1's
next pass checks this directly (see Tasks) before assuming it's unrelated infra.

**2026-09-17 on-device update (task 1, second pass — MECHANISM RULED OUT, closing the
investigation):**

*Idle-state check (done first, per Tasks):* instrumented `handleNameContainerLayout`/
`handleNameTextLayout` with a global counter + `console.log`, launched a live `halls/franklin`
route, and left it untouched. The counter climbed to 259 during the initial mount/settle burst
(21:35:47.7-21:35:48.3, expected — every visible row lays out once) and then **stayed at 259 for
6.4 minutes of idle** (last callback 21:35:48, still 259 at 21:42:10, `uiautomator dump` itself
succeeding repeatedly against the same settled screen throughout). The view tree does not churn at
idle. **Disposition: the `could not get idle state` failures are transient, confined to the
~1-2s mount storm right after navigation, not a non-terminating layout loop.** This isn't a
contradiction of PR #460's "healthy tree" finding (2026-09-13, also on `halls/franklin`) — both are
true of the same route at different moments (storm vs. settled). Don't re-open this; route around
it with `--wait-for` as usual (it worked fine every time this pass — see below) or a short fixed
sleep for anything that must probe mid-storm.

*Breakable-last-line fixture, both directions of the real tuck/untuck boundary:* built a one-off
dev fixture (`boundaryStressFixtureItems`, `--stress badge-boundary`, not committed — see
"Reproduce this" below to rebuild it in one shot) with `dishName: "Herb Marinated Chicken Breast
with Roasted Wild Rice Pilaf"` and nutrition `{calories:250, totalFatG:2, sodiumMg:100,
proteinG:15}` (clears all 4 real macro-preset thresholds). Measured on Narrow
(`Agent_Emulator_Narrow`, 229dp row-name container) at 0 badges: `lines=2`,
`lastLineWidth=143.2421875`. Threshold math for this device (`spacing(1)=4`, `spacing(2)=7`, so
`shouldTuckBadges` requires `lastLineWidth <= 229 - 7 - 7 - badgeRowWidth(n) = 215 - badgeRowWidth(n)`):
tuck holds for n=1..3 (thresholds 200/181/162, all ≥143) and **fails at n=4** (threshold 143,
needed `78.76 >= 79`, short by 0.24dp) — i.e. this fixture straddles the real n=3/n=4 tuck→untuck
line by design, not by accident, and crosses it in the direction that matters (more badges tuck
less). Toggled real FilterSheet macro chips (High Protein → Low Sodium → Under 300 Cal → Low Fat,
via `adb shell input tap`, not uiautomator-driven taps, since raw taps don't depend on accessibility
tree idle state) to walk n from 0→4, then Low Fat off again for 4→3, screen-recording both
transitions (`adb shell screenrecord`, pulled and split to frames with `ffmpeg`). **Both
transitions: zero overlap in any frame, and — the single clearest signal — `onTextLayout` did not
re-fire at all**, on either transition (only `onLayout`/`containerLayout` re-fired, confirming the
row remeasured but the *text* didn't). RN only calls `onTextLayout` when text's own layout actually
changes; its absence here is measured proof, not an inference, that badge count does not affect this
row's text layout on this device, for this name.

A second fixture (`"Grilled Herb Lemon Salmon Cake"`, 202.67dp on one line at 0 badges — the more
classic "short name gains badges, might get pushed to wrap" shape `lineCount>1`'s guard exists for)
confirmed the same invariant from the other side: at n=1 badge (needs 15+7=22dp, fits in the
26.33dp of slack) nothing changed; at n=2 (needs 34+7=41dp, doesn't fit) `containerLayout` re-fired
but **`textLayout` still didn't** — the badge row wrapped to its own new line below the
still-single-line name, confirmed visually, no overlap, no shrink, no reflow.

**Why, structurally (verify this reading before relying on it further, but it matches every
measurement above): `rowNameLine`'s `rowText` child has no `flexBasis`/width, so Yoga measures it
first against the row's own available width (effectively `AT_MOST 229dp`) independent of any
sibling — a node measured `AT_MOST W` cannot itself overflow `W`, so `flexShrink: 1` never has
anything to do. The badge row is placed *after* that measurement and simply wraps to a new flex
line (untucked) or gets absolutely positioned off it (tucked) — neither path ever changes what the
Text was already measured against. This makes the tuck decision structurally independent of its own
effect: there is no reflow for a stale measurement to mis-describe, for any dish name or badge
count, not just the two shapes tested. If this reading is right, the brief's original Rationale
(stale-`lastLine`-causes-reflow-causes-oscillation) does not describe a real code path in the
current `DishRow`/`hallMenuBadgeLayout.ts`, on this device, in the tested RN version.**

The "toggle two chips back-to-back before the first settles" acceptance bullet was not separately
exercised this pass (the 1→3 step above toggled two chips inside one FilterSheet open-to-Done
cycle, not two independent post-settle taps) — not dropped silently, but subsumed by the same
finding: if text layout is provably independent of badge count, the *order or timing* of badge-count
changes can't matter either, since there is no intermediate reflowed state for timing to race.

**Reproduce this (nothing committed — task 1 stayed investigation-only per its own "files: none")**:
add a fixture item shaped like `boundaryStressFixtureItems` above (`dishName` + nutrition verbatim
from this section), wire it the same way `long-names`/`composite` are wired in
`stationPriceFilteredItems`/`sectionsByPeriod`'s `isStressFixtureTab`, add temporary
`console.log`-based counters to `handleNameContainerLayout`/`handleNameTextLayout`, run
`screenshot.sh halls/franklin --device Agent_Emulator_Narrow --stress <key> --wait-for <fixture
text>` (works fine, no `--wait-for` avoidance needed), then drive FilterSheet's macro chips with raw
`adb shell input tap` (coordinates from a fresh `uiautomator dump` — it works on a settled screen)
and watch `adb logcat | grep DIAG` for whether `textLayout` re-fires.

**Re-scope, per this brief's own instruction ("settles clean, re-scope" if no mechanism confirms):**
task 2 as written (fix the reflow loop, add an invalidation rule, verify termination) has no bug to
fix — two independent fixture shapes, both directions of the real boundary, plus the idle-state
check, all came back clean. **Do not open task 2 as scoped.** What two passes and four prior "fixes"
(#449/#452/#454/#455) *do* establish as real and worth a small follow-up brief: `--stress
long-names`'s two fixtures cannot cross the tuck/untuck boundary at all (confirmed first pass), so
every one of those four PRs' "verified on-device" claims verified nothing about the actual tuck
decision. A follow-up should (a) commit a near-boundary fixture (not 0.24dp inside the line like
this pass's throwaway one — that's too fragile to keep passing across font/device changes) and (b)
pin the threshold math (`lastLineWidth <= containerWidth - 2*NAME_BADGE_GAP - badgeRowWidth(n)`, the
200/181/162/143 numbers above) as explicit `node --test` cases in `hallMenuBadgeLayout.test.ts`, so
the *next* claim of "verified the tuck boundary on-device" is actually checkable. That's a real,
scoped, small piece of work — distinct from "fix the overlap bug" — and needs its own brief/task if
the owner wants it done, not a rewrite of this one.
Rejected alternative: patch the specific badge-count transition observed in manual testing (as
#449/#452/#454/#455 each did) — rejected because this file has already been "fixed" for overlap/
visibility four times and regressed each time; a special case tuned to one reproduction is exactly
what kept failing here, so this brief asked for whatever invalidation makes the decision consistent
with what it measures. Two on-device passes now say there is nothing to invalidate.

## Acceptance

**Status 2026-09-17 (second pass): none of this was implemented.** Task 1 (root-cause) is done and
found no mechanism to fix — see the Rationale and Tasks sections above. These criteria describe
task 2's fix, which was not opened. Left unchecked, not stale: if the owner has a real recurrence to
share, this is where the fix would resume.

**Superseded by the owner's station-filter answer — kept for record, task 1's macro-badge chase:**
- [x] ~~Macro-badge chip toggle never overlaps dish name/nutrition line~~ — ruled out, no mechanism
      (two on-device passes, ~450k tokens combined — see Rationale)
- [x] ~~FilterSheet's own chip rows don't overlap~~ — ruled out (5 real chip toggles, no overlap)
- [ ] `--stress long-names` boundary-crossing fixture + `hallMenuBadgeLayout.ts` test — moved to
      `docs/briefs/hall-menu-badge-tuck-fixture-gap.md`, independent of this brief now

**Station-filter candidates, third pass (2026-09-18) — task 2 ruled out, task 3 confirmed via a
different trigger than the one these criteria named:**
- [x] ~~Toggling a station filter that empties one or more whole categories never renders a frame
      where a surviving row/section-header (still mid-`LinearTransition`) visually overlaps a
      recycled cell's new content~~ — ruled out structurally: positional `keyExtractor`/section-key
      scheme means a row/header after a removal point remounts (new React key) rather than
      persisting through a `layout` transition, so there is no mid-tween state to overlap. Settled
      result confirmed clean on real Franklin data; the transition itself is unobservable through
      `FilterSheet`'s occlusion either way — see third-pass Status above.
- [x] ~~Toggling a station filter that only thins rows within surviving sections (no section fully
      empties)~~ — ruled out by construction: `sectionsForPeriod`'s grouping key and
      `itemMatchesStationAndPriceFilter`'s test key are the same
      (`normalizeStationName(item.category)`), so a station toggle is always all-or-nothing per
      section; this shape cannot occur from a station-filter toggle alone.
- [ ] ~~Toggling a station filter while the scrubber highlight is visible never shows the highlight
      at a stale/off-track position~~ — not reproducible via a station-filter toggle specifically
      (same occlusion reason as above: the still-mounted list self-corrects before the sheet
      reveals it) — **but the underlying mechanism is real and confirmed via the date-step arrows**,
      which rebuild the same `activeStationSections` without occluding anything. Fixed — see task 3.
- [x] The `StationScrubber` highlight never renders at a stale/wrong position after
      `activeStationSections` is rebuilt (station/price filter, allergen/diet-tag filter, *or* a
      date step) — evidence: on-device before/after screenshots across a date step (the confirmed
      reproducer), plus `mobile/src/lib/hallMenu.test.tsx`'s new regression test
- [x] N/A — no `exiting` animation was needed; task 3's fix is a `useEffect` dependency-array
      change, not a layout/motion change, so no new duration/easing literal was introduced

## Tasks

1. **DONE (2026-09-17, second pass) — mechanism ruled out, not confirmed.** First pass ruled the
   mechanism OUT for an unbreakable last line and ruled out `FilterSheet`'s/`filters.tsx`'s own chip
   rows. Second pass: the idle-state check settled clean (`could not get idle state` is a transient
   mount-storm artifact, not a real loop — see the 2026-09-17 second-pass update above), and a
   breakable multi-word last line crossing the real n=3/n=4 tuck/untuck boundary, in both directions,
   on a real device, produced zero overlap and — the decisive signal — `onTextLayout` never re-fired
   on either transition, meaning badge count provably does not affect this row's text layout at all.
   A second fixture (single-line name gaining badges) confirmed the same invariant from the other
   side. Full evidence, the exact fixture to rebuild it, and the structural reason (`rowText` has no
   `flexBasis`, so Yoga measures it `AT_MOST` the container width independent of its badge-row
   sibling — `flexShrink: 1` never has anything to shrink from) are in the Rationale section above.
   No files changed (investigation only, as scoped) — the diagnostic fixture/logging built to test
   this were reverted, not committed.
   — files: none — lanes: none — blocked by: none — PR: none
2. **DONE (2026-09-18, third pass) — mechanism ruled out, not confirmed.** On real Franklin lunch
   data (Grill Station + Pasta Bar selected, Stir Fry Station skipped/removed to force the
   whole-category-emptying shape, `adb shell screenrecord` across the real `FilterSheet` toggle):
   settled result is clean, no overlap or residue. More importantly, structurally ruled out —
   `VirtualizedSectionList`'s positional `key` scheme (section key falls back to array position,
   item key includes position-within-section, both baked into this screen's own `keyExtractor`)
   means a row/header after any removal point remounts on a new React key rather than persisting
   through the `layout={LinearTransition...}` prop, so there is no mid-tween "surviving" element for
   a recycled cell to ever overlap — this holds regardless of toggle speed or which wrapper gets an
   `exiting` prop, so no `exiting` animation was added. The second acceptance bullet (row-thinning
   without fully emptying a section) is additionally unreachable by construction: the section
   grouping key and the filter's test key are the same field, so a station toggle can only ever be
   all-or-nothing per section. Full evidence and the exact repro recipe (raw `adb shell input tap`
   + `screenrecord`, not `--record-nav` — that flag is for mount-triggered animation, not a
   post-mount filter toggle) are in the third-pass Status section above. No files changed
   (investigation only) — the diagnostic recordings/crops built to check this were not committed.
   — files: none — lanes: none — blocked by: none — PR: none (findings folded into task 3's PR)
3. **DONE (2026-09-18, third pass) — confirmed and fixed, via the date-step arrows, not a station
   filter toggle.** A station-filter toggle doesn't reach this bug either (same occlusion reasoning
   as task 2 — the still-mounted list self-corrects `activeStationIndex` before `FilterSheet` ever
   reveals it), but the underlying state gap is real: `activeStationIndex` reset only on
   `[selectedMeal]`, not when `activeStationSections` itself gets rebuilt. A date step rebuilds it
   (a new day's own stations) without touching `selectedMeal`, and — unlike the filter case — there
   is no further scroll/layout event to correct a settled, unscrolled list, so the stale index
   survives indefinitely (confirmed on-device: still wrong 12s after the step, not a one-frame
   blip). Fix: widened the reset effect's deps to `[selectedMeal, activeStationSections]` — one
   dependency that already covers every reshape path (date step, station/price filter,
   allergen/diet-tag filter), not just the two the brief's own proposed fix
   (`stationFilter`/`priceFilter` in the deps) would have covered. New regression test in
   `mobile/src/lib/hallMenu.test.tsx` (red without the fix, confirmed via `git stash`), plus
   on-device before/after screenshots of the real date-step repro.
   — files: `mobile/src/app/halls/[slug].tsx`, `mobile/src/lib/hallMenu.test.tsx` — lanes:
   `cd mobile && npx tsc --noEmit`, `pnpm --filter mobile test`, `pnpm --filter mobile lint`,
   `cd mobile && npx expo export --platform android --output-dir /tmp/udine-export` (all green) —
   blocked by: none — PR: #511
4. **PARTIAL (2026-09-18, fourth pass) — mechanism confirmed, fix NOT confirmed working on-device.
   Do not merge/reopen the pushed branch's fix as-is; needs another pass or a decision below.**

   *Confirmed:* the anomaly reproduces reliably on real Franklin data (scroll deep past a station,
   filter to that one station, list reveals at its old absolute offset, no section header visible)
   and the root cause is real: a station/price/allergen-diet-tag filter reshapes
   `periodSections`/`grabSectionsMemo` *in place* — `GestureSectionList` never unmounts. A date step,
   by contrast, passes through the `stillLoading` skeleton branch first and gets a fresh mount "for
   free," which is *why* task 3's scrubber bug couldn't reach a settled-wrong state the same way this
   one does. Nothing today resets the still-mounted list's native scroll offset on a filter reshape.
   **Important correction: this is not literally the reported "overlapping elements" symptom** — no
   frame in any repro shows one element drawn over another, it's a disorienting wrong-scroll-position
   defect. Plausible as what a user would describe that way, but record the distinction, don't let
   this get logged as a literal confirmation of the original report.

   *Not confirmed:* the attempted fix (two `useEffect`s calling `scrollToLocation({sectionIndex:0,
   itemIndex:0}, animated:false)` keyed on `[stationFilter, priceFilter]` + an allergen/diet-tag
   reshape key, deliberately excluding `macroPresets` since task 1 already ruled that out as a reflow
   risk) did NOT visibly reset the scroll position across this pass's most careful on-device repro
   attempts. A new jest test (`hallMenu.test.tsx`) is red→green, but only proves `scrollToLocation`
   gets *called* with the right args, not that the list actually moves — same synthetic-input gap
   flagged for PR #454 in memory. The pass's on-device harness was unreliable this round (queued/
   delayed touch events landing several actions late, a `stress=long-names` param bleeding into
   `useLocalSearchParams` across relaunches, `FilterSheet`'s scrollable content reporting stale
   accessibility bounds) — a real fix could be failing, or the harness could be lying. Not
   distinguished yet.

   *New, independently confirmed, separate defect (not yet its own brief):*
   `handleScrollToIndexFailed` (`[slug].tsx:1280`, pre-existing since #458) calls
   `getListRef(tab).current?.getListRef?.()?.scrollToOffset?.(...)` — traced against this repo's own
   `react-native` dependency tree, stock `SectionList` never exposes a `getListRef()` method
   publicly, so `.getListRef?.()` is always `undefined` and this entire recovery chain has been a
   silent no-op since it shipped. Worth its own brief regardless of what happens here, and worth
   checking first if a fifth pass is dispatched — this pass's own `scrollToLocation` retries could be
   hitting the same dead end if `onScrollToIndexFailed` (not a successful scroll) is what's actually
   firing; that wasn't distinguished this pass either.

   Branch pushed, not merged, no PR: `fix/hall-menu-scroll-offset` (2 commits on `origin/main`
   `ca7cad4`). Files touched: `mobile/src/app/halls/[slug].tsx` (the two effects, unconfirmed),
   `mobile/src/lib/hallMenu.test.tsx` (new test, real red→green but doesn't prove the fix works).
   **Decision needed before continuing** (deliberately left open, not resolved in this pass): (a)
   another on-device attempt with a cleaner harness (isolate from the stress-param bleed-through and
   touch-queueing issues this pass hit), (b) fix the dead `handleScrollToIndexFailed` chain first as
   a prerequisite, since it may be entangled, or (c) leave this as "root cause understood, fix
   unverified" for now and not spend a fifth pass immediately.
   — files: `mobile/src/app/halls/[slug].tsx`, `mobile/src/lib/hallMenu.test.tsx` — lanes:
   `cd mobile && npx tsc --noEmit`, `pnpm --filter mobile test`, `pnpm --filter mobile lint`,
   `cd mobile && npx expo export --platform android --output-dir /tmp/udine-export` — blocked by:
   none — PR: none (not opened — fix unconfirmed, per this brief's own discipline)
5. **NEW (2026-09-18) — real on-device reproduction from the owner, via the vegetarian diet-tag
   filter.** See "Status (2026-09-18, real reproduction from the owner)" above for the full
   evidence and reasoning. Start from `docs/briefs/hall-menu-scroll-recovery-dead-code.md` (task 4's
   decision (b): the dead `handleScrollToIndexFailed` chain is already its own ready-to-dispatch
   brief, independent of this one, and task 4 itself flagged it as possibly entangled with this
   symptom) before re-attempting task 4's pushed-but-unmerged fix (`fix/hall-menu-scroll-offset`,
   `ca7cad4`) against the new vegetarian-filter trigger specifically. Reproduce first on real hall
   data with the vegetarian filter (Hampshire/dinner and Franklin/lunch both reproduced for the
   owner; intermittent, not every toggle), get a clean on-device capture of the actual defect (the
   blank-gap and clipped-row-top shapes in the evidence images), then determine whether the pushed
   branch's fix already addresses it or needs to change. — files: `mobile/src/app/halls/[slug].tsx`,
   `mobile/src/lib/hallMenu.test.tsx` — lanes: `cd mobile && npx tsc --noEmit`,
   `pnpm --filter mobile test`, `pnpm --filter mobile lint`,
   `cd mobile && npx expo export --platform android --output-dir /tmp/udine-export` — blocked by:
   none (but see recommendation to start from the scroll-recovery brief) — PR:
