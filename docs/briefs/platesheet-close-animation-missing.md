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

1. **DONE (2026-09-18, PR #519, merged) — one real bug found and fixed; brief stays open, not
   fully closed.** The brief's own `modalVisible`-unmounting hypothesis was investigated directly
   (a controlled test with a mocked `withTiming` completion callback) and **refuted** —
   `modalVisible` correctly stays mounted through the full close tween, unaffected by #514. The
   actual bug: a separate `PlateSheet.tsx` effect ("closing invalidates whatever's in flight and
   resets the search box") was keyed on `visible` (flips false the instant the user taps to close)
   instead of `modalVisible` (only flips false once the close tween's own completion callback
   fires) — tearing down search content mid-slide. Fixed by keying that effect on `modalVisible`.
   Confirmed on-device (`Agent_Emulator_Wide`): a native-frame extraction of the pre-fix build
   shows the panel mid-slide with content already wiped blank, plus a Reanimated/Fabric
   `RetryableMountingLayerException` in logcat at the same moment; post-fix, content persists
   through the full slide.

   **Disclosed, unresolved gap (per `pr-reviewer`'s MERGE-with-condition, do not close this brief
   over it):** the owner's original report describes the sheet on a real Galaxy A53 "just
   vanishing" with zero motion. On the x86_64 emulator used for this pass, both pre- and post-fix
   builds show a real partial-slide frame at native frame rate — the reproduced pre-fix bug is a
   content flash mid-slide, not a literal zero-frame vanish. Plausible theory (unconfirmed): a
   slower real device drops more frames under the same content-teardown contention, producing what
   reads as a full vanish. If the owner still sees a full zero-motion vanish on the A53 after #519,
   that is a live follow-up against this same brief, not a reopened regression — get a real-device
   recording before assuming the fix is incomplete or root-causing further blind.
   — files: `mobile/src/components/PlateSheet.tsx`, `mobile/src/components/PlateSheet.closeContent.test.tsx`
   — lanes: `cd mobile && npx tsc --noEmit`, `pnpm --filter mobile test`, `pnpm --filter mobile lint`
   — blocked by: none — PR: #519
