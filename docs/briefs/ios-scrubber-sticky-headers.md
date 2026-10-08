# Station scrubber works on iOS

Goal: dragging the hall menu's station scrubber jumps the dish list to the touched station on iOS,
the way it already does on Android. Today the shipped iOS build's scrubber does nothing useful.

## Spec

UI: none new — existing `StationScrubber` (`mobile/src/components/StationScrubber.tsx`), no visual
change.
Annotations: none.
States: hall menu with ≥3 stations → drag the scrubber top→bottom → list jumps station by station;
tap a single segment → list jumps to that station; Android behavior unchanged.
Routes: `halls/franklin --record 3` with a vertical swipe down the scrubber's right-edge track
(check `docs/pr-review-media/` for the #458/#463 scrubber captures' exact swipe coordinates).

Backend: none.
Residency: none.

Rationale: hypothesis, not confirmed — agents cannot run iOS (no Mac; the iOS gate is a human
tester on TestFlight, see decisions-log). RN's `SectionList` defaults `stickySectionHeadersEnabled`
to `Platform.OS === 'ios'` (`node_modules/react-native/Libraries/Lists/SectionList.js`), and
`mobile/src/app/halls/[slug].tsx` never sets it on either `GestureSectionList` (~L1715, ~L1784).
So only iOS runs sticky section headers — which here are `Reanimated.View`s with a
`LinearTransition` layout animation — while the scrubber's `commitDragIndex` jumps with
`scrollToLocation({ sectionIndex, itemIndex: 0 })`. Every on-device check of the scrubber (#458,
#463, #465, #511) ran on the Android pool, which never exercises that combination. Setting the prop
to `false` explicitly makes iOS run exactly the code path Android ships and verified. Rejected:
keeping sticky headers on both platforms — that's a design change no artboard specifies, and it
would make Android newly diverge from what's been verified.

Part two — Android as a better iOS proxy: sweep `mobile/src` for other `SectionList`/`FlatList`/
`ScrollView` (incl. `createNativeWrapper`-wrapped) usages relying on a prop whose RN default
differs by platform, and set it explicitly to the value Android currently runs. Known
platform-divergent defaults to check at minimum: `stickySectionHeadersEnabled` (SectionList),
`removeClippedSubviews` (VirtualizedList: true on Android only). Leave `bounces`/`overScrollMode`
alone — those are native-feel affordances, not behavior divergence. List what you changed in the PR
body. Then add one jest test that walks the rendered hall-menu tree (or greps the source, if
rendering is impractical) and fails on any `SectionList`/`GestureSectionList` without an explicit
`stickySectionHeadersEnabled` — so the next list can't silently re-diverge.

## Acceptance

- [ ] Both hall-menu `GestureSectionList`s pass `stickySectionHeadersEnabled={false}` — evidence: test (red first: fails on main)
- [ ] Guard test fails on a SectionList without an explicit `stickySectionHeadersEnabled` — evidence: test
- [ ] Other platform-divergent list defaults made explicit, listed in PR body — evidence: test | PR body
- [ ] Scrubber drag still jumps station-by-station on Android — evidence: screenshot (`--record`)
- [ ] PR body carries `iOS: pending tester` with the steps: open Franklin lunch, drag scrubber top→bottom, tap a middle segment; expect the list to land on each station's header — evidence: PR body

## Tasks

1. Explicit sticky-header prop + guard test + platform-default sweep — files: `mobile/src/app/halls/[slug].tsx`, any list the sweep touches, one new test under `mobile/src/lib/` — lanes: mobile jest, lint, typecheck — blocked by: none — PR:
