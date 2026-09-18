# Hall menu: `onScrollToIndexFailed` recovery has always been a silent no-op

Goal: when `StationScrubber` or any other caller asks the hall-menu list to scroll to an
unmeasured/off-screen index and RN's `scrollToLocation` fails, the existing recovery path actually
recovers instead of doing nothing.

## Spec

UI: none new — this is a bugfix inside `mobile/src/app/halls/[slug].tsx`'s existing scroll-recovery
handler, no rendered-output change of its own.
Annotations: none.
States: n/a (no UI to screenshot) — this is proven by API surface, not a device state.
Routes: none required for verification (see Rationale) — optional manual confirmation via
`halls/franklin`, scroll to force a `scrollToLocation` miss (e.g. `StationScrubber`'s jump-to-station
on a very long, not-yet-measured list), and check the recovery actually lands near the target.

Backend: none.
Residency: none.

Rationale: found while root-causing `docs/briefs/hall-menu-filter-overlap.md`'s scroll-offset
candidate (2026-09-18, fourth pass), independent of that brief's own open question — this is
provable from the dependency tree, no device needed. `handleScrollToIndexFailed`
(`mobile/src/app/halls/[slug].tsx:1280`, present since PR #458) does:

```
getListRef(tab).current?.getListRef?.()?.scrollToOffset?.(...)
```

`SectionList` (`react-native`'s `Libraries/Lists/SectionList.js`, this repo's installed version)
only ever publicly exposes `scrollToLocation`, `recordInteraction`, `flashScrollIndicators`,
`getScrollResponder`, `getScrollableNode`, and `setNativeProps` on its ref — it never re-exposes
`VirtualizedSectionList`'s own internal `getListRef()`. So `.getListRef?.()` is always `undefined`,
and the entire chain silently no-ops via optional chaining — no error, no fallback, just nothing
happening. This has been true since the handler shipped in #458; nobody could have seen the recovery
fail from a "clean" test run because it fails silently by design (optional chaining swallows it).
Rejected alternative: leave it — rejected because a scroll-to-index failure is exactly the case this
handler exists to correct (per its own name), and a silent no-op means a jump-to-station tap on a
long, freshly-mounted list can currently leave the user stranded at the wrong scroll position with
no recovery at all, indistinguishable from "nothing happened."

## Acceptance

- [ ] `handleScrollToIndexFailed` uses an API the `SectionList` ref actually exposes (`scrollToLocation`
      with a computed fallback index/offset, per RN's own documented pattern for this callback, or
      `getScrollResponder()`/`getScrollableNode()` if a raw offset scroll is genuinely needed) —
      evidence: test (mock the ref, assert the correct public method is called with sane args)
- [ ] A unit/component test proves the OLD code path was dead (call `handleScrollToIndexFailed` with
      a ref shaped like the real `SectionList` ref, i.e. without a `getListRef` method, and assert
      nothing happened before the fix / something happens after) — evidence: test, red before fix
- [ ] No behavior change to the success path (`scrollToLocation` still called first as today; this
      only fixes what happens after it reports a failure) — evidence: existing tests still pass

## Tasks

1. Replace the dead `.getListRef?.()?.scrollToOffset?.(...)` chain with a real recovery using
   `SectionList`'s actual public ref API. — files: `mobile/src/app/halls/[slug].tsx`,
   `mobile/src/lib/hallMenu.test.tsx` — lanes: `cd mobile && npx tsc --noEmit`,
   `pnpm --filter mobile test`, `pnpm --filter mobile lint` — blocked by: none — PR:
