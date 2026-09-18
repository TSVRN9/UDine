# PlateSheet doesn't animate closed

Goal: closing Your Plate plays its close animation again (slide/fade down, matching how it opens)
instead of just disappearing.

## Spec

UI: none new — this is a bugfix to `PlateSheet`'s existing close motion, governed by
`durations.sheet` (300ms, `mobile/src/lib/motion.ts:38`) and `useDraggableSheet`'s
`backdropStyle`/`panelStyle` animated values (`mobile/src/lib/sheetAnimation.ts`).
Annotations: none.
States: PlateSheet open with content → tap the scrim or the handle/back affordance to close →
observe whether the backdrop fade and panel slide-down actually play, or the sheet just vanishes.
Routes: `halls/franklin --record-nav --record 3 --tap <plate bar coords>` then a second capture with
a `--tap` on the scrim to close, or whatever gesture this repo's `screenshot.sh` already uses for
sheet-close captures elsewhere (check prior PRs under `docs/pr-review-media/` for a precedent).

Backend: none.
Residency: none.

Rationale: reported 2026-09-18 by the owner: Your Plate no longer animates when closed. Not yet
root-caused. Worth checking first, as a hypothesis rather than a confirmed cause: PR #514
(`docs/briefs/platesheet-keyboard-follow-real-device.md`) changed `PlateSheet` from an RN `<Modal>`
to an absolutely-positioned in-screen overlay gated by `if (!modalVisible) return null` — if
`modalVisible` is flipping to false (unmounting the component) before `useDraggableSheet`'s close
animation actually finishes, that would explain a hard cutoff with no visible close motion.
`useDraggableSheet`'s own close-animation timing and the `modalVisible` state machine should be
compared against how they worked when hosted in a real `Modal`, to confirm whether this is a genuine
regression from that change or a pre-existing/unrelated issue. Whoever picks this up should dispatch
after #514 merges, since it touches the exact code #514 just changed.

## Acceptance

- [ ] Closing PlateSheet plays the same backdrop-fade/panel-slide close motion it always has —
      evidence: screenshot/recording (before/after, or a frame-by-frame comparison like #507's own
      evidence)
- [ ] If the root cause is `modalVisible` unmounting before the close animation completes, the fix
      keeps the component mounted through the full close animation, matching pre-#514 behavior —
      evidence: test asserting the animated close duration elapses before unmount

## Tasks

1. Root-cause why the close animation isn't playing and fix it. — files:
   `mobile/src/components/PlateSheet.tsx`, `mobile/src/lib/sheetAnimation.ts` (and its test) —
   lanes: `cd mobile && npx tsc --noEmit`, `pnpm --filter mobile test`, `pnpm --filter mobile lint`
   — blocked by: PR #514 merging first (touches the same recently-changed code) — PR:
